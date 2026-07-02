import { Global, Module } from '@nestjs/common';
import { NodeClientService } from './node-client.service';

@Global()
@Module({
  providers: [NodeClientService],
  exports: [NodeClientService],
})
export class GrpcClientModule {}
