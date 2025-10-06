import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PathManifestsService } from './path-manifests.service' 

@Module({
  imports: [ ConfigModule ],
  controllers: [],
  providers: [ PathManifestsService ],
  exports: [ PathManifestsService ]
})
export class PathManifestsModule {}
