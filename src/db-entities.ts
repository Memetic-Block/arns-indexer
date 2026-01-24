import { ArnsRecord } from './arns/schema/arns-record.entity'
import { AntRecord } from './arns/schema/ant-record.entity'
import { ArnsRecordArchive } from './arns/schema/arns-record-archive.entity'
import { AntRecordArchive } from './arns/schema/ant-record-archive.entity'
import { AntResolvedTarget } from './arns/schema/ant-resolved-target.entity'
import { CrawledDocument } from './arns/schema/crawled-document.entity'

export const dbEntities = [
  ArnsRecord,
  AntRecord,
  ArnsRecordArchive,
  AntRecordArchive,
  AntResolvedTarget,
  CrawledDocument
]
