// Package grpcserver implémente le contrat NodeService (voir
// api/openapi/elysia.proto) exposé par Elysia Node au Backend.
package grpcserver

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/elysia-panel/elysia-node/internal/backupmgr"
	"github.com/elysia-panel/elysia-node/internal/dockermgr"
	"github.com/elysia-panel/elysia-node/internal/filemgr"
	nodev1 "github.com/elysia-panel/elysia-node/proto"
)

const nodeVersion = "0.1.0-mvp"

type Server struct {
	nodev1.UnimplementedNodeServiceServer

	docker  *dockermgr.Manager
	files   *filemgr.Manager
	backups *backupmgr.Manager
}

func New(docker *dockermgr.Manager, files *filemgr.Manager, backups *backupmgr.Manager) *Server {
	return &Server{docker: docker, files: files, backups: backups}
}

func (s *Server) Ping(_ context.Context, req *nodev1.PingRequest) (*nodev1.PingResponse, error) {
	return &nodev1.PingResponse{Nonce: req.GetNonce(), NodeVersion: nodeVersion}, nil
}

func (s *Server) CreateServer(ctx context.Context, req *nodev1.CreateServerRequest) (*nodev1.ServerActionResponse, error) {
	dataPath, err := s.files.EnsureServerRoot(req.GetServerUuid())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "préparation dossier de données: %v", err)
	}

	ports := make([]dockermgr.PortSpec, 0, len(req.GetPorts()))
	for _, p := range req.GetPorts() {
		ip := p.GetIp()
		if ip == "" {
			ip = "0.0.0.0"
		}
		ports = append(ports, dockermgr.PortSpec{IP: ip, Port: int(p.GetPort()), Protocol: p.GetProtocol()})
	}

	spec := dockermgr.ServerSpec{
		UUID:           req.GetServerUuid(),
		Image:          req.GetDockerImage(),
		StartupCommand: req.GetStartupCommand(),
		CPULimitPct:    req.GetCpuLimitPct(),
		MemoryLimitMb:  req.GetMemoryLimitMb(),
		DiskLimitMb:    req.GetDiskLimitMb(),
		SwapLimitMb:    req.GetSwapLimitMb(),
		IOWeight:       req.GetIoWeight(),
		Environment:    req.GetEnvironment(),
		Ports:          ports,
		DataPath:       dataPath,
	}

	if err := s.docker.CreateServer(ctx, spec); err != nil {
		return &nodev1.ServerActionResponse{Success: false, Message: err.Error()}, nil
	}

	if req.GetInstallScript() != "" {
		if err := s.files.Write(req.GetServerUuid(), "install.sh", []byte(req.GetInstallScript())); err != nil {
			return &nodev1.ServerActionResponse{Success: false, Message: fmt.Sprintf("écriture install.sh: %v", err)}, nil
		}
	}

	return &nodev1.ServerActionResponse{Success: true, Message: "serveur créé"}, nil
}

func (s *Server) ReinstallServer(ctx context.Context, req *nodev1.CreateServerRequest) (*nodev1.ServerActionResponse, error) {
	dataPath, err := s.files.EnsureServerRoot(req.GetServerUuid())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "préparation dossier de données: %v", err)
	}

	ports := make([]dockermgr.PortSpec, 0, len(req.GetPorts()))
	for _, p := range req.GetPorts() {
		ip := p.GetIp()
		if ip == "" {
			ip = "0.0.0.0"
		}
		ports = append(ports, dockermgr.PortSpec{IP: ip, Port: int(p.GetPort()), Protocol: p.GetProtocol()})
	}

	spec := dockermgr.ServerSpec{
		UUID:           req.GetServerUuid(),
		Image:          req.GetDockerImage(),
		StartupCommand: req.GetStartupCommand(),
		CPULimitPct:    req.GetCpuLimitPct(),
		MemoryLimitMb:  req.GetMemoryLimitMb(),
		DiskLimitMb:    req.GetDiskLimitMb(),
		SwapLimitMb:    req.GetSwapLimitMb(),
		IOWeight:       req.GetIoWeight(),
		Environment:    req.GetEnvironment(),
		Ports:          ports,
		DataPath:       dataPath,
	}

	if err := s.docker.RecreateServer(ctx, spec); err != nil {
		return &nodev1.ServerActionResponse{Success: false, Message: err.Error()}, nil
	}

	if req.GetInstallScript() != "" {
		if err := s.files.Write(req.GetServerUuid(), "install.sh", []byte(req.GetInstallScript())); err != nil {
			return &nodev1.ServerActionResponse{Success: false, Message: fmt.Sprintf("écriture install.sh: %v", err)}, nil
		}
	}

	return &nodev1.ServerActionResponse{Success: true, Message: "serveur réinstallé"}, nil
}

func (s *Server) StartServer(ctx context.Context, req *nodev1.ServerIdRequest) (*nodev1.ServerActionResponse, error) {
	if err := s.docker.StartServer(ctx, req.GetServerUuid()); err != nil {
		return &nodev1.ServerActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.ServerActionResponse{Success: true}, nil
}

func (s *Server) StopServer(ctx context.Context, req *nodev1.ServerIdRequest) (*nodev1.ServerActionResponse, error) {
	if err := s.docker.StopServer(ctx, req.GetServerUuid()); err != nil {
		return &nodev1.ServerActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.ServerActionResponse{Success: true}, nil
}

func (s *Server) RestartServer(ctx context.Context, req *nodev1.ServerIdRequest) (*nodev1.ServerActionResponse, error) {
	if err := s.docker.RestartServer(ctx, req.GetServerUuid()); err != nil {
		return &nodev1.ServerActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.ServerActionResponse{Success: true}, nil
}

func (s *Server) KillServer(ctx context.Context, req *nodev1.ServerIdRequest) (*nodev1.ServerActionResponse, error) {
	if err := s.docker.KillServer(ctx, req.GetServerUuid()); err != nil {
		return &nodev1.ServerActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.ServerActionResponse{Success: true}, nil
}

func (s *Server) DeleteServer(ctx context.Context, req *nodev1.ServerIdRequest) (*nodev1.ServerActionResponse, error) {
	if err := s.docker.DeleteServer(ctx, req.GetServerUuid()); err != nil {
		return &nodev1.ServerActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.ServerActionResponse{Success: true}, nil
}

func (s *Server) SendCommand(_ context.Context, req *nodev1.SendCommandRequest) (*nodev1.ServerActionResponse, error) {
	if err := s.docker.SendCommand(req.GetServerUuid(), req.GetCommand()); err != nil {
		return &nodev1.ServerActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.ServerActionResponse{Success: true}, nil
}

func (s *Server) StreamConsole(req *nodev1.ServerIdRequest, stream nodev1.NodeService_StreamConsoleServer) error {
	return s.docker.StreamLogs(stream.Context(), req.GetServerUuid(), func(line string, stderr bool) {
		streamName := "stdout"
		if stderr {
			streamName = "stderr"
		}
		_ = stream.Send(&nodev1.ConsoleLine{
			ServerUuid:  req.GetServerUuid(),
			Line:        line,
			TimestampMs: time.Now().UnixMilli(),
			Stream:      streamName,
		})
	})
}

func (s *Server) StreamStats(req *nodev1.ServerIdRequest, stream nodev1.NodeService_StreamStatsServer) error {
	return s.docker.StreamStats(stream.Context(), req.GetServerUuid(), func(snap dockermgr.StatsSnapshot) {
		_ = stream.Send(&nodev1.ServerStatsResponse{
			ServerUuid:     req.GetServerUuid(),
			CpuUsagePct:    snap.CPUUsagePct,
			MemoryUsedMb:   snap.MemoryUsedMb,
			NetworkRxBytes: snap.NetworkRxBytes,
			NetworkTxBytes: snap.NetworkTxBytes,
			State:          "running",
		})
	})
}

func (s *Server) ListFiles(_ context.Context, req *nodev1.ListFilesRequest) (*nodev1.ListFilesResponse, error) {
	entries, err := s.files.List(req.GetServerUuid(), req.GetPath())
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "%v", err)
	}
	out := make([]*nodev1.FileEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, &nodev1.FileEntry{
			Name:         e.Name,
			IsDirectory:  e.IsDirectory,
			SizeBytes:    e.SizeBytes,
			ModifiedAtMs: e.ModifiedAtMs,
			Mode:         e.Mode,
		})
	}
	return &nodev1.ListFilesResponse{Entries: out}, nil
}

func (s *Server) ReadFile(_ context.Context, req *nodev1.FileRequest) (*nodev1.FileContentResponse, error) {
	content, err := s.files.Read(req.GetServerUuid(), req.GetPath())
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "%v", err)
	}
	return &nodev1.FileContentResponse{Content: content}, nil
}

func (s *Server) WriteFile(_ context.Context, req *nodev1.WriteFileRequest) (*nodev1.FileActionResponse, error) {
	if err := s.files.Write(req.GetServerUuid(), req.GetPath(), req.GetContent()); err != nil {
		return &nodev1.FileActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.FileActionResponse{Success: true}, nil
}

func (s *Server) DeleteFile(_ context.Context, req *nodev1.FileRequest) (*nodev1.FileActionResponse, error) {
	if err := s.files.Delete(req.GetServerUuid(), req.GetPath()); err != nil {
		return &nodev1.FileActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.FileActionResponse{Success: true}, nil
}

func (s *Server) RenameFile(_ context.Context, req *nodev1.RenameFileRequest) (*nodev1.FileActionResponse, error) {
	if err := s.files.Rename(req.GetServerUuid(), req.GetFromPath(), req.GetToPath()); err != nil {
		return &nodev1.FileActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.FileActionResponse{Success: true}, nil
}

func (s *Server) CreateDirectory(_ context.Context, req *nodev1.FileRequest) (*nodev1.FileActionResponse, error) {
	if err := s.files.Mkdir(req.GetServerUuid(), req.GetPath()); err != nil {
		return &nodev1.FileActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.FileActionResponse{Success: true}, nil
}

// isRemoteDriver: tout driver autre que LOCAL est un stockage compatible S3
// (S3, CLOUDFLARE_R2, BACKBLAZE_B2, MINIO partagent tous la même API S3 —
// voir backupmgr.RemoteConfig). SFTP/FTP restent non implémentés.
func isRemoteDriver(driver string) bool {
	switch driver {
	case "", "LOCAL":
		return false
	case "S3", "CLOUDFLARE_R2", "BACKBLAZE_B2", "MINIO":
		return true
	default:
		return false
	}
}

func (s *Server) CreateBackup(ctx context.Context, req *nodev1.CreateBackupRequest) (*nodev1.BackupActionResponse, error) {
	if !isRemoteDriver(req.GetDriver()) {
		result, err := s.backups.Create(req.GetServerUuid(), req.GetBackupId())
		if err != nil {
			return &nodev1.BackupActionResponse{Success: false, Message: err.Error()}, nil
		}
		return &nodev1.BackupActionResponse{Success: true, SizeBytes: result.SizeBytes, Checksum: result.Checksum}, nil
	}

	cfg, err := backupmgr.RemoteConfigFromMap(req.GetDriverConfig())
	if err != nil {
		return &nodev1.BackupActionResponse{Success: false, Message: err.Error()}, nil
	}
	result, err := s.backups.CreateRemote(ctx, req.GetServerUuid(), req.GetBackupId(), cfg)
	if err != nil {
		return &nodev1.BackupActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.BackupActionResponse{Success: true, SizeBytes: result.SizeBytes, Checksum: result.Checksum}, nil
}

func (s *Server) RestoreBackup(ctx context.Context, req *nodev1.RestoreBackupRequest) (*nodev1.BackupActionResponse, error) {
	if !isRemoteDriver(req.GetDriver()) {
		if err := s.backups.Restore(req.GetServerUuid(), req.GetBackupId()); err != nil {
			return &nodev1.BackupActionResponse{Success: false, Message: err.Error()}, nil
		}
		return &nodev1.BackupActionResponse{Success: true}, nil
	}

	cfg, err := backupmgr.RemoteConfigFromMap(req.GetDriverConfig())
	if err != nil {
		return &nodev1.BackupActionResponse{Success: false, Message: err.Error()}, nil
	}
	if err := s.backups.RestoreRemote(ctx, req.GetServerUuid(), req.GetBackupId(), req.GetRemotePath(), cfg); err != nil {
		return &nodev1.BackupActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.BackupActionResponse{Success: true}, nil
}

func (s *Server) DeleteBackup(ctx context.Context, req *nodev1.BackupIdRequest) (*nodev1.BackupActionResponse, error) {
	if !isRemoteDriver(req.GetDriver()) {
		if err := s.backups.Delete(req.GetServerUuid(), req.GetBackupId()); err != nil {
			return &nodev1.BackupActionResponse{Success: false, Message: err.Error()}, nil
		}
		return &nodev1.BackupActionResponse{Success: true}, nil
	}

	cfg, err := backupmgr.RemoteConfigFromMap(req.GetDriverConfig())
	if err != nil {
		return &nodev1.BackupActionResponse{Success: false, Message: err.Error()}, nil
	}
	if err := s.backups.DeleteRemote(ctx, req.GetServerUuid(), req.GetBackupId(), req.GetRemotePath(), cfg); err != nil {
		return &nodev1.BackupActionResponse{Success: false, Message: err.Error()}, nil
	}
	return &nodev1.BackupActionResponse{Success: true}, nil
}
