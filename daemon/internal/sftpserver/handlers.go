package sftpserver

import (
	"io"
	"os"

	"github.com/pkg/sftp"

	"github.com/elysia-panel/elysia-node/internal/filemgr"
)

// fsHandlers implémente sftp.Handlers pour UNE session SFTP déjà
// authentifiée : toutes les opérations sont bornées au dossier de données
// du serveur (via filemgr.Resolve, qui neutralise ".." et rejette toute
// sortie du dossier) et refusées en écriture si readOnly (sub-utilisateur
// sans permission files.write).
type fsHandlers struct {
	files      *filemgr.Manager
	serverUUID string
	readOnly   bool
}

func newHandlers(files *filemgr.Manager, serverUUID string, readOnly bool) sftp.Handlers {
	h := &fsHandlers{files: files, serverUUID: serverUUID, readOnly: readOnly}
	return sftp.Handlers{FileGet: h, FilePut: h, FileCmd: h, FileList: h}
}

func newRequestServer(rw io.ReadWriteCloser, files *filemgr.Manager, serverUUID string, readOnly bool) *sftp.RequestServer {
	return sftp.NewRequestServer(rw, newHandlers(files, serverUUID, readOnly))
}

func (h *fsHandlers) resolve(relPath string) (string, error) {
	return h.files.Resolve(h.serverUUID, relPath)
}

func (h *fsHandlers) Fileread(r *sftp.Request) (io.ReaderAt, error) {
	full, err := h.resolve(r.Filepath)
	if err != nil {
		return nil, sftp.ErrSSHFxPermissionDenied
	}
	return os.Open(full)
}

func (h *fsHandlers) Filewrite(r *sftp.Request) (io.WriterAt, error) {
	if h.readOnly {
		return nil, sftp.ErrSSHFxPermissionDenied
	}
	full, err := h.resolve(r.Filepath)
	if err != nil {
		return nil, sftp.ErrSSHFxPermissionDenied
	}
	return os.OpenFile(full, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
}

func (h *fsHandlers) Filecmd(r *sftp.Request) error {
	if h.readOnly {
		return sftp.ErrSSHFxPermissionDenied
	}
	full, err := h.resolve(r.Filepath)
	if err != nil {
		return sftp.ErrSSHFxPermissionDenied
	}

	switch r.Method {
	case "Setstat":
		return nil // no-op: pas de gestion fine des permissions Unix pour l'instant
	case "Rename":
		target, err := h.resolve(r.Target)
		if err != nil {
			return sftp.ErrSSHFxPermissionDenied
		}
		return os.Rename(full, target)
	case "Rmdir", "Remove":
		return os.RemoveAll(full)
	case "Mkdir":
		return os.MkdirAll(full, 0o755)
	case "Symlink":
		return sftp.ErrSSHFxOpUnsupported
	default:
		return sftp.ErrSSHFxOpUnsupported
	}
}

func (h *fsHandlers) Filelist(r *sftp.Request) (sftp.ListerAt, error) {
	full, err := h.resolve(r.Filepath)
	if err != nil {
		return nil, sftp.ErrSSHFxPermissionDenied
	}

	switch r.Method {
	case "List":
		entries, err := os.ReadDir(full)
		if err != nil {
			return nil, err
		}
		infos := make([]os.FileInfo, 0, len(entries))
		for _, e := range entries {
			info, err := e.Info()
			if err != nil {
				continue
			}
			infos = append(infos, info)
		}
		return listerAt(infos), nil
	case "Stat", "Readlink":
		info, err := os.Stat(full)
		if err != nil {
			return nil, err
		}
		return listerAt([]os.FileInfo{info}), nil
	default:
		return nil, sftp.ErrSSHFxOpUnsupported
	}
}

type listerAt []os.FileInfo

func (l listerAt) ListAt(dest []os.FileInfo, offset int64) (int, error) {
	if offset >= int64(len(l)) {
		return 0, io.EOF
	}
	n := copy(dest, l[offset:])
	if n < len(dest) {
		return n, io.EOF
	}
	return n, nil
}
