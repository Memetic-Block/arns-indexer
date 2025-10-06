import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
  .then(() => {
    console.log(`Wuzzy Crawler is running on port ${process.env.PORT ?? 3000}`)
  })
  .catch((error) => {
    console.error('Error starting Wuzzy Crawler:', error)
    process.exit(1)
  })
