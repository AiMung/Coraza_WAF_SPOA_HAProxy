package services

import (
	"testing"
)

func TestCountryCodeToFlag(t *testing.T) {
	tests := []struct {
		code     string
		expected string
	}{
		{"VN", "🇻🇳"},
		{"US", "🇺🇸"},
		{"DE", "🇩🇪"},
		{"JP", "🇯🇵"},
		{"vn", "🇻🇳"}, // lowercase handling
		{"", "🌐"},   // empty
		{"V", "🌐"},  // single char
		{"VNM", "🌐"}, // 3 chars
	}

	for _, tt := range tests {
		got := countryCodeToFlag(tt.code)
		if got != tt.expected {
			t.Errorf("countryCodeToFlag(%q) = %q; want %q", tt.code, got, tt.expected)
		}
	}
}

func TestLookupGeoIP_EmptyAndLoopback(t *testing.T) {
	// Empty IP
	res := LookupGeoIP("")
	if res.Country != "Vietnam" || res.CountryCode != "VN" {
		t.Errorf("LookupGeoIP(\"\") unexpected result: %+v", res)
	}

	// Localhost
	resLocal := LookupGeoIP("127.0.0.1")
	if resLocal.Country != "Localhost" || resLocal.CountryCode != "LOCAL" {
		t.Errorf("LookupGeoIP(\"127.0.0.1\") unexpected result: %+v", resLocal)
	}

	// ::1
	resV6 := LookupGeoIP("::1")
	if resV6.Country != "Localhost" {
		t.Errorf("LookupGeoIP(\"::1\") unexpected result: %+v", resV6)
	}
}

func TestLookupGeoIP_PrivateRanges(t *testing.T) {
	privateIPs := []string{"192.168.1.100", "10.0.1.5", "172.16.0.10"}
	for _, ip := range privateIPs {
		res := LookupGeoIP(ip)
		if res.CountryCode != "VN" || res.Flag != "🇻🇳" {
			t.Errorf("LookupGeoIP(%s) for private IP failed: %+v", ip, res)
		}
	}
}

func TestLookupGeoIP_Cache(t *testing.T) {
	ip := "192.168.246.100"
	first := LookupGeoIP(ip)
	second := LookupGeoIP(ip)
	if first != second {
		t.Errorf("Cache lookup mismatch: first=%+v, second=%+v", first, second)
	}
}
