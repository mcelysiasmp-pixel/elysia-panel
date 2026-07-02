// Package filemgr expose des opérations fichiers bornées au dossier de
// données d'un serveur, avec protection contre la traversée de chemin
// (path traversal) : toute résolution qui sortirait de ce dossier est
// rejetée avant toute lecture/écriture disque.
package filemgr

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// UID/GID de l'utilisateur "elysia" dans toutes les images Docker officielles
// (voir docker-images/base/Dockerfile) — le dossier de données doit
// appartenir à cet UID pour que le processus du conteneur (non-root) puisse
// y écrire une fois bind-monté sur /data.
const containerUID = 1000
const containerGID = 1000

type Manager struct {
	dataDir string // ex: /srv/elysia
}

func New(dataDir string) *Manager {
	return &Manager{dataDir: dataDir}
}

func (m *Manager) serverRoot(uuid string) string {
	return filepath.Join(m.dataDir, "servers", uuid)
}

// resolve calcule le chemin absolu réel et vérifie qu'il reste sous la
// racine du serveur concerné.
func (m *Manager) resolve(uuid, relPath string) (string, error) {
	root := m.serverRoot(uuid)
	cleaned := filepath.Clean("/" + relPath) // neutralise les ".." remontants
	full := filepath.Join(root, cleaned)
	if !strings.HasPrefix(full, root) {
		return "", fmt.Errorf("chemin en dehors du dossier du serveur: %s", relPath)
	}
	return full, nil
}

type FileEntry struct {
	Name         string
	IsDirectory  bool
	SizeBytes    int64
	ModifiedAtMs int64
	Mode         string
}

func (m *Manager) List(uuid, relPath string) ([]FileEntry, error) {
	dir, err := m.resolve(uuid, relPath)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	result := make([]FileEntry, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		result = append(result, FileEntry{
			Name:         e.Name(),
			IsDirectory:  e.IsDir(),
			SizeBytes:    info.Size(),
			ModifiedAtMs: info.ModTime().UnixMilli(),
			Mode:         info.Mode().String(),
		})
	}
	return result, nil
}

func (m *Manager) Read(uuid, relPath string) ([]byte, error) {
	full, err := m.resolve(uuid, relPath)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(full)
}

func (m *Manager) Write(uuid, relPath string, content []byte) error {
	full, err := m.resolve(uuid, relPath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	return os.WriteFile(full, content, 0o644)
}

func (m *Manager) Mkdir(uuid, relPath string) error {
	full, err := m.resolve(uuid, relPath)
	if err != nil {
		return err
	}
	return os.MkdirAll(full, 0o755)
}

func (m *Manager) Delete(uuid, relPath string) error {
	full, err := m.resolve(uuid, relPath)
	if err != nil {
		return err
	}
	return os.RemoveAll(full)
}

func (m *Manager) Rename(uuid, fromRel, toRel string) error {
	from, err := m.resolve(uuid, fromRel)
	if err != nil {
		return err
	}
	to, err := m.resolve(uuid, toRel)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
		return err
	}
	return os.Rename(from, to)
}

// Resolve expose resolve() aux paquets frères (sftpserver) qui doivent
// appliquer exactement la même protection anti path-traversal plutôt que
// de la dupliquer.
func (m *Manager) Resolve(uuid, relPath string) (string, error) {
	return m.resolve(uuid, relPath)
}

// EnsureServerRoot crée le dossier de données d'un serveur (appelé à la
// création du serveur, avant le premier démarrage du conteneur).
func (m *Manager) EnsureServerRoot(uuid string) (string, error) {
	root := m.serverRoot(uuid)
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}
	// Best-effort : échoue silencieusement si le daemon ne tourne pas en
	// root (dev local), auquel cas l'image devra être lancée avec un UID
	// correspondant au propriétaire réel du dossier.
	_ = os.Chown(root, containerUID, containerGID)
	return root, nil
}
