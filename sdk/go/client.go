// Package elysia fournit un client Go minimal pour l'API Elysia Panel.
// Pour les endpoints non couverts par les méthodes typées, utilisez
// Client.Request directement — la spécification complète est publiée par
// le Backend sur /api/docs-json (OpenAPI 3).
package elysia

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	BaseURL     string
	AccessToken string
	HTTPClient  *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		HTTPClient: &http.Client{Timeout: 30 * time.Second},
	}
}

type APIError struct {
	StatusCode int
	Body       []byte
}

func (e *APIError) Error() string {
	return fmt.Sprintf("elysia: erreur API %d: %s", e.StatusCode, string(e.Body))
}

// Request est l'échappatoire générique vers n'importe quel endpoint.
func (c *Client) Request(method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.AccessToken)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	if resp.StatusCode >= 400 {
		return &APIError{StatusCode: resp.StatusCode, Body: respBody}
	}
	if out != nil && len(respBody) > 0 {
		return json.Unmarshal(respBody, out)
	}
	return nil
}

type TokenPair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}

func (c *Client) Login(email, password string) (*TokenPair, error) {
	var tokens TokenPair
	err := c.Request(http.MethodPost, "/auth/login", map[string]string{"email": email, "password": password}, &tokens)
	return &tokens, err
}

func (c *Client) ListServers() ([]map[string]any, error) {
	var servers []map[string]any
	err := c.Request(http.MethodGet, "/servers", nil, &servers)
	return servers, err
}

func (c *Client) PowerAction(serverID, action string) error {
	return c.Request(http.MethodPost, fmt.Sprintf("/servers/%s/power/%s", serverID, action), nil, nil)
}
