package dockermgr

import (
	"encoding/json"
	"io"

	"github.com/docker/docker/api/types/container"
)

// StatsSnapshot est la forme simplifiée renvoyée par StreamStats, directement
// mappable sur ServerStatsResponse côté proto (voir internal/grpcserver).
type StatsSnapshot struct {
	CPUUsagePct    float64
	MemoryUsedMb   int64
	NetworkRxBytes int64
	NetworkTxBytes int64
}

type statsDecoder struct {
	dec *json.Decoder
}

func newStatsDecoder(r io.Reader) *statsDecoder {
	return &statsDecoder{dec: json.NewDecoder(r)}
}

func (d *statsDecoder) next() (StatsSnapshot, error) {
	var raw container.StatsResponse
	if err := d.dec.Decode(&raw); err != nil {
		return StatsSnapshot{}, err
	}

	var rx, tx uint64
	for _, n := range raw.Networks {
		rx += n.RxBytes
		tx += n.TxBytes
	}

	return StatsSnapshot{
		CPUUsagePct:    cpuPercent(raw),
		MemoryUsedMb:   int64(raw.MemoryStats.Usage) / (1024 * 1024),
		NetworkRxBytes: int64(rx),
		NetworkTxBytes: int64(tx),
	}, nil
}

// cpuPercent réplique le calcul utilisé par `docker stats` (delta d'usage
// CPU du conteneur / delta d'usage CPU système, ramené au nombre de coeurs).
func cpuPercent(s container.StatsResponse) float64 {
	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage) - float64(s.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(s.CPUStats.SystemUsage) - float64(s.PreCPUStats.SystemUsage)
	if systemDelta <= 0 || cpuDelta <= 0 {
		return 0
	}
	onlineCPUs := float64(s.CPUStats.OnlineCPUs)
	if onlineCPUs == 0 {
		onlineCPUs = float64(len(s.CPUStats.CPUUsage.PercpuUsage))
	}
	if onlineCPUs == 0 {
		onlineCPUs = 1
	}
	return (cpuDelta / systemDelta) * onlineCPUs * 100.0
}
