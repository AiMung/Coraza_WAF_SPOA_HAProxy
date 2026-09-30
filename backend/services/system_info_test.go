package services

import (
	"testing"
	"time"
)

func TestGetRealSystemMetrics(t *testing.T) {
	start := time.Now().Add(-2 * time.Hour)
	metrics := GetRealSystemMetrics(start)

	if metrics.CPUCores <= 0 {
		t.Errorf("Expected CPUCores > 0, got %d", metrics.CPUCores)
	}

	if metrics.GoRoutines <= 0 {
		t.Errorf("Expected GoRoutines > 0, got %d", metrics.GoRoutines)
	}

	if metrics.OSName == "" {
		t.Errorf("Expected OSName to not be empty")
	}

	if metrics.UptimeStr == "" {
		t.Errorf("Expected UptimeStr to not be empty")
	}

	if metrics.Arch == "" {
		t.Errorf("Expected Arch to not be empty")
	}
}
