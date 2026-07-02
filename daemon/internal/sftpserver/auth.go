package sftpserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type authResult struct {
	Allowed    bool   `json:"allowed"`
	ServerUUID string `json:"serverUuid"`
	ReadOnly   bool   `json:"readOnly"`
}

// authenticate délègue la vérification des identifiants au Backend, seul
// détenteur des comptes utilisateurs et des permissions de sub-utilisateurs
// — le daemon ne connaît ni mots de passe ni RBAC. Voir
// backend/src/files/sftp-auth.controller.ts pour le contrat.
func (s *Server) authenticate(username, password string) (*authResult, error) {
	payload, err := json.Marshal(map[string]string{"username": username, "password": password})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, s.cfg.PanelInternalURL+"/api/internal/sftp/auth", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Node-Secret", s.cfg.NodeSecret)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("appel backend pour l'auth SFTP: %w", err)
	}
	defer resp.Body.Close()

	// NestJS répond 201 Created par défaut sur un POST (pas 200) — seule la
	// plage 2xx signale un succès applicatif ici.
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &authResult{Allowed: false}, nil
	}

	var result authResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("réponse backend illisible: %w", err)
	}
	return &result, nil
}
