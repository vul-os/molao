package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

// ProxyConfig holds the configuration for proxy management
type ProxyConfig struct {
	WebshareAPIKey  string   `json:"webshare_api_key"`
	Mode            string   `json:"mode"` // direct or backbone
	CountryFilter   string   `json:"country_filter"`
	PageSize        int      `json:"page_size"`
	ExcludeIPs      []string `json:"exclude_ips"`
	RefreshInterval int      `json:"refresh_interval"` // in minutes
}

// Proxy represents a single proxy from Webshare
type Proxy struct {
	ID               string    `json:"id"`
	Username         string    `json:"username"`
	Password         string    `json:"password"`
	ProxyAddress     string    `json:"proxy_address"`
	Port             int       `json:"port"`
	Valid            bool      `json:"valid"`
	LastVerification time.Time `json:"last_verification"`
	CountryCode      string    `json:"country_code"`
	CityName         string    `json:"city_name"`
	CreatedAt        time.Time `json:"created_at"`
	LastUsed         time.Time `json:"-"` // Internal tracking
	ErrorCount       int       `json:"-"` // Internal tracking
}

// ProxyResponse represents the paginated response from Webshare
type ProxyResponse struct {
	Count    int     `json:"count"`
	Next     *string `json:"next"`
	Previous *string `json:"previous"`
	Results  []Proxy `json:"results"`
}

// ProxyManager handles proxy rotation and management
type ProxyManager struct {
	config      ProxyConfig
	proxies     []Proxy
	currentIdx  int
	mu          sync.RWMutex
	client      *http.Client
	lastRefresh time.Time
}

// NewProxyManager initializes a new proxy manager
func NewProxyManager(config ProxyConfig) *ProxyManager {
	if config.PageSize == 0 {
		config.PageSize = 25
	}
	if config.RefreshInterval == 0 {
		config.RefreshInterval = 30 // Default 30 minutes
	}
	if config.Mode == "" {
		config.Mode = "direct"
	}

	pm := &ProxyManager{
		config: config,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}

	// Start proxy refresh goroutine
	go pm.autoRefresh()

	return pm
}

// autoRefresh periodically refreshes the proxy list
func (pm *ProxyManager) autoRefresh() {
	ticker := time.NewTicker(time.Duration(pm.config.RefreshInterval) * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		if err := pm.RefreshProxies(); err != nil {
			fmt.Printf("Failed to refresh proxies: %v\n", err)
		}
	}
}

// RefreshProxies fetches fresh proxy list from Webshare
func (pm *ProxyManager) RefreshProxies() error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	apiURL := fmt.Sprintf("https://proxy.webshare.io/api/v2/proxy/list/?mode=%s&page_size=%d",
		pm.config.Mode, pm.config.PageSize)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create proxy list request: %v", err)
	}

	req.Header.Set("Authorization", "Token "+pm.config.WebshareAPIKey)

	resp, err := pm.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to fetch proxy list: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("proxy list request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var proxyResp ProxyResponse
	if err := json.NewDecoder(resp.Body).Decode(&proxyResp); err != nil {
		return fmt.Errorf("failed to decode proxy response: %v", err)
	}

	// Filter out excluded IPs and invalid proxies
	filteredProxies := make([]Proxy, 0)
	for _, proxy := range proxyResp.Results {
		if proxy.Valid {
			proxy.LastUsed = time.Now()
			proxy.ErrorCount = 0
			filteredProxies = append(filteredProxies, proxy)
		}
	}

	if len(filteredProxies) == 0 {
		return fmt.Errorf("no valid proxies available after filtering")
	}

	pm.proxies = filteredProxies
	pm.currentIdx = 0
	pm.lastRefresh = time.Now()

	return nil
}

// isExcludedIP checks if the IP is in the excluded list
func (pm *ProxyManager) isExcludedIP(ip string) bool {
	for _, excludedIP := range pm.config.ExcludeIPs {
		if ip == excludedIP {
			return true
		}
	}
	return false
}

// GetNextProxy returns the next available proxy in rotation
func (pm *ProxyManager) GetNextProxy() (*Proxy, error) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if len(pm.proxies) == 0 {
		return nil, fmt.Errorf("no proxies available")
	}

	// Check if refresh is needed
	if time.Since(pm.lastRefresh) > time.Duration(pm.config.RefreshInterval)*time.Minute {
		if err := pm.RefreshProxies(); err != nil {
			fmt.Printf("Warning: Failed to refresh proxies: %v\n", err)
		}
	}

	// Find the next valid proxy with minimal errors
	startIdx := pm.currentIdx
	for i := 0; i < len(pm.proxies); i++ {
		idx := (startIdx + i) % len(pm.proxies)
		if pm.proxies[idx].ErrorCount < 3 {
			pm.currentIdx = (idx + 1) % len(pm.proxies)
			proxy := pm.proxies[idx]
			proxy.LastUsed = time.Now()
			return &proxy, nil
		}
	}

	return nil, fmt.Errorf("no healthy proxies available")
}

// MarkProxyError marks a proxy as having an error
func (pm *ProxyManager) MarkProxyError(proxyID string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for i := range pm.proxies {
		if pm.proxies[i].ID == proxyID {
			pm.proxies[i].ErrorCount++
			break
		}
	}
}

// ResetProxyErrors resets error count for a proxy
func (pm *ProxyManager) ResetProxyErrors(proxyID string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for i := range pm.proxies {
		if pm.proxies[i].ID == proxyID {
			pm.proxies[i].ErrorCount = 0
			break
		}
	}
}

// CreateProxyHTTPClient creates an HTTP client configured to use the given proxy
func (pm *ProxyManager) CreateProxyHTTPClient(proxy *Proxy) (*http.Client, error) {
	if proxy == nil {
		return nil, fmt.Errorf("proxy cannot be nil")
	}

	proxyURL := fmt.Sprintf("http://%s:%s@%s:%d",
		url.QueryEscape(proxy.Username),
		url.QueryEscape(proxy.Password),
		proxy.ProxyAddress,
		proxy.Port,
	)

	parsedProxyURL, err := url.Parse(proxyURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse proxy URL: %v", err)
	}

	transport := &http.Transport{
		Proxy: http.ProxyURL(parsedProxyURL),
		// Additional transport configurations
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		MaxConnsPerHost:       10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{
		Transport: transport,
		Timeout:   60 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("stopped after 10 redirects")
			}
			return nil
		},
	}, nil
}

// CheckProxyHealth verifies if a proxy is working
func (pm *ProxyManager) CheckProxyHealth(proxy *Proxy) bool {
	client, err := pm.CreateProxyHTTPClient(proxy)
	if err != nil {
		return false
	}

	req, err := http.NewRequest("GET", "http://ip-api.com/json", nil)
	if err != nil {
		return false
	}

	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

// GetProxyStats returns current proxy pool statistics
func (pm *ProxyManager) GetProxyStats() map[string]interface{} {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	var activeCount, errorCount int
	for _, proxy := range pm.proxies {
		if proxy.ErrorCount < 3 {
			activeCount++
		} else {
			errorCount++
		}
	}

	return map[string]interface{}{
		"total_proxies":   len(pm.proxies),
		"active_proxies":  activeCount,
		"errored_proxies": errorCount,
		"last_refresh":    pm.lastRefresh,
	}
}
