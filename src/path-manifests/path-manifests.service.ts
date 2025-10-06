import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class PathManifestsService {
  private readonly logger: Logger = new Logger(PathManifestsService.name)

  constructor() {}
}
