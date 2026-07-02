// Package dockermgr encapsule toutes les interactions avec le moteur Docker
// local pour le compte d'Elysia Node : cycle de vie des conteneurs de jeu,
// réseaux isolés par serveur, statistiques et flux de logs.
package dockermgr

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"strings"
	"sync"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

const labelServerUUID = "io.elysia.server_uuid"

// PortSpec décrit un mapping hôte/conteneur pour un serveur.
type PortSpec struct {
	IP       string
	Port     int
	Protocol string // tcp | udp
}

// ServerSpec décrit tout ce qu'il faut pour créer le conteneur d'un serveur.
type ServerSpec struct {
	UUID           string
	Image          string
	StartupCommand string
	CPULimitPct    int32
	MemoryLimitMb  int64
	DiskLimitMb    int64
	SwapLimitMb    int64
	IOWeight       int32
	Environment    map[string]string
	Ports          []PortSpec
	DataPath       string // chemin hôte, ex: /srv/elysia/servers/<uuid>
}

type Manager struct {
	cli           *client.Client
	dataDir       string
	dockerNetwork string

	mu               sync.Mutex
	stdinAttachments map[string]io.WriteCloser
}

func New(dataDir, dockerNetwork string) (*Manager, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("connexion au démon Docker: %w", err)
	}
	return &Manager{
		cli:              cli,
		dataDir:          dataDir,
		dockerNetwork:    dockerNetwork,
		stdinAttachments: make(map[string]io.WriteCloser),
	}, nil
}

func containerName(uuid string) string {
	return "elysia_" + uuid
}

func serverNetworkName(uuid string) string {
	return "elysia_srv_" + uuid
}

// EnsureServerNetwork crée (si besoin) le réseau Docker isolé dédié à un
// serveur, pour empêcher toute communication directe entre les conteneurs
// de deux clients différents (voir docs/architecture §4).
func (m *Manager) EnsureServerNetwork(ctx context.Context, uuid string) (string, error) {
	name := serverNetworkName(uuid)
	networks, err := m.cli.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		return "", err
	}
	for _, n := range networks {
		if n.Name == name {
			return n.ID, nil
		}
	}
	resp, err := m.cli.NetworkCreate(ctx, name, network.CreateOptions{
		Driver: "bridge",
		Labels: map[string]string{labelServerUUID: uuid},
	})
	if err != nil {
		return "", fmt.Errorf("création réseau %s: %w", name, err)
	}
	return resp.ID, nil
}

func (m *Manager) CreateServer(ctx context.Context, spec ServerSpec) error {
	netID, err := m.EnsureServerNetwork(ctx, spec.UUID)
	if err != nil {
		return err
	}

	reader, err := m.cli.ImagePull(ctx, spec.Image, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("pull image %s: %w", spec.Image, err)
	}
	defer reader.Close()
	_, _ = io.Copy(io.Discard, reader)

	env := make([]string, 0, len(spec.Environment))
	for k, v := range spec.Environment {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}

	exposedPorts := nat.PortSet{}
	portBindings := nat.PortMap{}
	for _, p := range spec.Ports {
		proto := p.Protocol
		if proto == "" {
			proto = "tcp"
		}
		portKey := nat.Port(fmt.Sprintf("%d/%s", p.Port, proto))
		exposedPorts[portKey] = struct{}{}
		portBindings[portKey] = []nat.PortBinding{{HostIP: p.IP, HostPort: fmt.Sprintf("%d", p.Port)}}
	}

	config := &container.Config{
		Image:        spec.Image,
		Env:          env,
		Cmd:          []string{"/bin/sh", "-c", spec.StartupCommand},
		WorkingDir:   "/data",
		ExposedPorts: exposedPorts,
		OpenStdin:    true,
		AttachStdin:  true,
		Tty:          false,
		Labels:       map[string]string{labelServerUUID: spec.UUID},
	}

	memoryBytes := spec.MemoryLimitMb * 1024 * 1024
	hostConfig := &container.HostConfig{
		Binds:        []string{fmt.Sprintf("%s:/data", spec.DataPath)},
		PortBindings: portBindings,
		NetworkMode:  container.NetworkMode(serverNetworkName(spec.UUID)),
		RestartPolicy: container.RestartPolicy{
			Name: container.RestartPolicyUnlessStopped,
		},
		Resources: container.Resources{
			NanoCPUs:    int64(spec.CPULimitPct) * 10_000_000, // 100% == 1 CPU == 1e9 nanocpus
			Memory:      memoryBytes,
			MemorySwap:  memoryBytes + spec.SwapLimitMb*1024*1024,
			BlkioWeight: uint16(spec.IOWeight),
		},
	}

	networkingConfig := &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{
			serverNetworkName(spec.UUID): {NetworkID: netID},
		},
	}

	_, err = m.cli.ContainerCreate(ctx, config, hostConfig, networkingConfig, nil, containerName(spec.UUID))
	if err != nil {
		return fmt.Errorf("création conteneur: %w", err)
	}
	return nil
}

func (m *Manager) StartServer(ctx context.Context, uuid string) error {
	if err := m.cli.ContainerStart(ctx, containerName(uuid), container.StartOptions{}); err != nil {
		return err
	}
	return m.attachStdin(ctx, uuid)
}

func (m *Manager) StopServer(ctx context.Context, uuid string) error {
	timeout := 30
	return m.cli.ContainerStop(ctx, containerName(uuid), container.StopOptions{Timeout: &timeout})
}

func (m *Manager) RestartServer(ctx context.Context, uuid string) error {
	timeout := 30
	if err := m.cli.ContainerRestart(ctx, containerName(uuid), container.StopOptions{Timeout: &timeout}); err != nil {
		return err
	}
	return m.attachStdin(ctx, uuid)
}

func (m *Manager) KillServer(ctx context.Context, uuid string) error {
	return m.cli.ContainerKill(ctx, containerName(uuid), "SIGKILL")
}

func (m *Manager) DeleteServer(ctx context.Context, uuid string) error {
	m.detachStdin(uuid)
	_ = m.cli.ContainerRemove(ctx, containerName(uuid), container.RemoveOptions{Force: true, RemoveVolumes: true})
	return m.cli.NetworkRemove(ctx, serverNetworkName(uuid))
}

// RecreateServer supprime le conteneur existant (données et réseau
// conservés) puis le recrée avec spec — utilisé par ReinstallServer quand la
// config (image/startup/env) a changé et qu'un simple redémarrage ne
// suffit pas à la relire.
func (m *Manager) RecreateServer(ctx context.Context, spec ServerSpec) error {
	m.detachStdin(spec.UUID)
	if err := m.cli.ContainerRemove(ctx, containerName(spec.UUID), container.RemoveOptions{Force: true}); err != nil && !client.IsErrNotFound(err) {
		return fmt.Errorf("suppression ancien conteneur: %w", err)
	}
	return m.CreateServer(ctx, spec)
}

// SendCommand écrit une ligne de commande dans le stdin du conteneur — c'est
// ainsi que les serveurs Minecraft (et la plupart des jeux en console)
// reçoivent des commandes admin ("stop", "say ...", etc).
func (m *Manager) SendCommand(uuid, command string) error {
	m.mu.Lock()
	w, ok := m.stdinAttachments[uuid]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("aucun stdin attaché pour le serveur %s (est-il démarré ?)", uuid)
	}
	_, err := w.Write([]byte(command + "\n"))
	return err
}

func (m *Manager) attachStdin(ctx context.Context, uuid string) error {
	resp, err := m.cli.ContainerAttach(ctx, containerName(uuid), container.AttachOptions{
		Stream: true,
		Stdin:  true,
	})
	if err != nil {
		return fmt.Errorf("attach stdin: %w", err)
	}
	m.mu.Lock()
	m.stdinAttachments[uuid] = resp.Conn
	m.mu.Unlock()
	return nil
}

func (m *Manager) detachStdin(uuid string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if w, ok := m.stdinAttachments[uuid]; ok {
		_ = w.Close()
		delete(m.stdinAttachments, uuid)
	}
}

// StreamLogs suit la sortie stdout/stderr du conteneur et invoque onLine
// pour chaque ligne. Bloque jusqu'à annulation du contexte ou fin du flux.
func (m *Manager) StreamLogs(ctx context.Context, uuid string, onLine func(line string, stderr bool)) error {
	out, err := m.cli.ContainerLogs(ctx, containerName(uuid), container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Tail:       "100",
	})
	if err != nil {
		return err
	}
	defer out.Close()

	// Les logs multiplexés Docker préfixent chaque frame d'un header de 8
	// octets (stream type + taille) quand le conteneur n'a pas de TTY.
	return demuxLogs(out, onLine)
}

func demuxLogs(r io.Reader, onLine func(line string, stderr bool)) error {
	reader := bufio.NewReader(r)
	header := make([]byte, 8)
	for {
		if _, err := io.ReadFull(reader, header); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		streamType := header[0]
		size := int(header[3]) | int(header[2])<<8 | int(header[1])<<16 | int(header[0])<<24
		_ = size
		payloadSize := int(header[7]) | int(header[6])<<8 | int(header[5])<<16 | int(header[4])<<24
		payload := make([]byte, payloadSize)
		if _, err := io.ReadFull(reader, payload); err != nil {
			return err
		}
		for _, line := range strings.Split(strings.TrimRight(string(payload), "\n"), "\n") {
			if line != "" {
				onLine(line, streamType == 2)
			}
		}
	}
}

// StreamStats invoque onStats à intervalle régulier avec les métriques
// d'utilisation du conteneur (CPU/mémoire/réseau).
func (m *Manager) StreamStats(ctx context.Context, uuid string, onStats func(StatsSnapshot)) error {
	resp, err := m.cli.ContainerStats(ctx, containerName(uuid), true)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	decoder := newStatsDecoder(resp.Body)
	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}
		snap, err := decoder.next()
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		onStats(snap)
	}
}

func (m *Manager) Close() error {
	return m.cli.Close()
}
