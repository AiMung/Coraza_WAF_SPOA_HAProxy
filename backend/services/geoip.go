package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type GeoIPResult struct {
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	RegionName  string  `json:"region_name"`
	City        string  `json:"city"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	ISP         string  `json:"isp"`
	Flag        string  `json:"flag"`
}

var (
	geoCache   = make(map[string]GeoIPResult)
	geoCacheMu sync.RWMutex
	httpClient = &http.Client{Timeout: 3 * time.Second}
)

func countryCodeToFlag(code string) string {
	if len(code) != 2 {
		return "🌐"
	}
	code = strings.ToUpper(code)
	r1 := rune(code[0]) - 'A' + 0x1F1E6
	r2 := rune(code[1]) - 'A' + 0x1F1E6
	return string([]rune{r1, r2})
}

// LookupGeoIP resolves IP address geolocation using free public API with local memory caching
func LookupGeoIP(ip string) GeoIPResult {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return GeoIPResult{Country: "Vietnam", CountryCode: "VN", City: "Ho Chi Minh", Lat: 10.8231, Lon: 106.6297, Flag: "🇻🇳", ISP: "Local WAF Host"}
	}

	// 1. Check in-memory cache
	geoCacheMu.RLock()
	if cached, found := geoCache[ip]; found {
		geoCacheMu.RUnlock()
		return cached
	}
	geoCacheMu.RUnlock()

	// 2. Private LAN & Localhost IPs -> Local Server (Vietnam)
	if ip == "127.0.0.1" || ip == "::1" || ip == "localhost" {
		res := GeoIPResult{Country: "Localhost", CountryCode: "LOCAL", City: "Loopback", Lat: 10.8231, Lon: 106.6297, Flag: "🏠", ISP: "Internal Loopback"}
		saveCache(ip, res)
		return res
	}

	if strings.HasPrefix(ip, "192.168.") || strings.HasPrefix(ip, "10.") || strings.HasPrefix(ip, "172.16.") || strings.HasPrefix(ip, "172.17.") || strings.HasPrefix(ip, "172.18.") {
		res := GeoIPResult{Country: "Vietnam", CountryCode: "VN", City: "Ho Chi Minh City", Lat: 10.8231, Lon: 106.6297, Flag: "🇻🇳", ISP: "Enterprise Local Network"}
		saveCache(ip, res)
		return res
	}

	// 3. Query free ip-api.com endpoint
	url := fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,countryCode,regionName,city,lat,lon,isp,query", ip)
	resp, err := httpClient.Get(url)
	if err == nil && resp.StatusCode == http.StatusOK {
		var apiData struct {
			Status      string  `json:"status"`
			Country     string  `json:"country"`
			CountryCode string  `json:"countryCode"`
			RegionName  string  `json:"regionName"`
			City        string  `json:"city"`
			Lat         float64 `json:"lat"`
			Lon         float64 `json:"lon"`
			ISP         string  `json:"isp"`
		}
		if jsonErr := json.NewDecoder(resp.Body).Decode(&apiData); jsonErr == nil && apiData.Status == "success" {
			resp.Body.Close()
			res := GeoIPResult{
				Country:     apiData.Country,
				CountryCode: apiData.CountryCode,
				RegionName:  apiData.RegionName,
				City:        apiData.City,
				Lat:         apiData.Lat,
				Lon:         apiData.Lon,
				ISP:         apiData.ISP,
				Flag:        countryCodeToFlag(apiData.CountryCode),
			}
			saveCache(ip, res)
			return res
		}
		resp.Body.Close()
	}

	// 4. Fallback Default
	fallback := GeoIPResult{Country: "Vietnam", CountryCode: "VN", City: "Ho Chi Minh", Lat: 10.8231, Lon: 106.6297, Flag: "🇻🇳", ISP: "Internet Gateway"}
	saveCache(ip, fallback)
	return fallback
}

func saveCache(ip string, res GeoIPResult) {
	geoCacheMu.Lock()
	defer geoCacheMu.Unlock()
	geoCache[ip] = res
}
