import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
  .then(() => {
    console.log(`ArNS Indexer is running on port ${process.env.PORT ?? 3000}`)
  })
  .catch((error) => {
    console.error('Error starting ArNS Indexer:', error)
    process.exit(1)
  })
