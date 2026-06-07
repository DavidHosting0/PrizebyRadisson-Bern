import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AviationService } from './aviation.service';
import { GeocodingService } from './geocoding.service';
import { MonitorMapController } from './monitor-map.controller';
import { MonitorMapScheduler } from './monitor-map.scheduler';
import { MonitorMapService } from './monitor-map.service';
import { NewsAnalysisService } from './news-analysis.service';
import { NewsIngestService } from './news-ingest.service';
import { PoliceIngestService } from './police-ingest.service';

@Module({
  imports: [SettingsModule],
  controllers: [MonitorMapController],
  providers: [
    MonitorMapService,
    MonitorMapScheduler,
    NewsIngestService,
    PoliceIngestService,
    NewsAnalysisService,
    GeocodingService,
    AviationService,
  ],
})
export class MonitorMapModule {}
