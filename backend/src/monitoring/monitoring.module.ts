import { Module } from '@nestjs/common';
import {
  PrometheusModule,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';

// Étape 15 : expose /api/metrics au format Prometheus (voir
// monitoring/prometheus/prometheus.yml qui scrape ce endpoint) et des
// gauges métier (serveurs en ligne, nodes en ligne, capacité allouée).
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  controllers: [MonitoringController],
  providers: [
    MonitoringService,
    makeGaugeProvider({
      name: 'elysia_nodes_online',
      help: 'Nombre de nodes Elysia en ligne',
    }),
    makeGaugeProvider({
      name: 'elysia_servers_running',
      help: "Nombre de serveurs en cours d'exécution",
    }),
    makeGaugeProvider({
      name: 'elysia_servers_total',
      help: 'Nombre total de serveurs',
    }),
  ],
  exports: [MonitoringService],
})
export class MonitoringModule {}
