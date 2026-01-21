import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { ChangeStream } from 'mongodb';
import { Connection } from 'mongoose';
import { EventsGateway } from './events.gateway';

@Injectable()
export class DbChangeListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbChangeListener.name);
  private changeStream: ChangeStream | null = null;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly eventsGateway: EventsGateway,
  ) {}

  onModuleInit() {
    try {
      // Lắng nghe mọi thay đổi trên toàn bộ database (insert/update/delete/replace)
      this.changeStream = this.connection.watch([], {
        fullDocument: 'updateLookup',
      });

      this.changeStream.on('change', (change) => {
        const payload: any = change as any;
        const fullDocument = payload.fullDocument;
        const sanitized =
          payload.ns?.coll === 'users' && fullDocument
            ? (() => {
                const { passwordHashed, __v, ...rest } = fullDocument;
                return rest;
              })()
            : fullDocument;
        // Emit sự kiện chung kèm collection và loại thao tác
        this.eventsGateway.server.emit('db_change', {
          collection: payload.ns?.coll,
          operationType: payload.operationType,
          documentId: payload.documentKey?._id,
          fullDocument: sanitized,
        });
      });

      this.changeStream.on('error', (error) => {
        this.logger.warn(
          `MongoDB Change Stream error: ${error?.message || error}`,
        );
      });

      this.logger.log('Global MongoDB Change Stream initialized');
    } catch (error: any) {
      // Replica set/sharded cluster required
      this.logger.warn(
        `Could not initialize global MongoDB Change Stream: ${error?.message || error}`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.changeStream) {
      try {
        await this.changeStream.close();
      } catch {
        // ignore
      }
      this.changeStream = null;
    }
  }
}
