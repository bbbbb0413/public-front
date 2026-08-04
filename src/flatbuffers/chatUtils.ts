import * as flatbuffers from 'flatbuffers';
import * as Chat from './generated/chat';

export interface DecodedMessage {
  id: string;
  status: number;
  senderId: string;
  content: string;
  metadata: string;
  timestamp: number;
  eventTimestamp: number;
}

export interface DecodedMessageBatch {
  messages: DecodedMessage[];
  latestEventTimestamp: number;
}

/**
 * SendMessageRequest 객체를 FlatBuffers 바이너리(Uint8Array)로 직렬화합니다.
 */
export function buildSendMessageRequest(
  roomId: string,
  content: string,
  metadata: string = ''
): Uint8Array {
  const builder = new flatbuffers.Builder(1024);

  const roomIdOffset = builder.createString(roomId);
  const contentOffset = builder.createString(content);
  const metadataOffset = builder.createString(metadata);

  Chat.SendMessageRequest.startSendMessageRequest(builder);
  Chat.SendMessageRequest.addRoomId(builder, roomIdOffset);
  Chat.SendMessageRequest.addContent(builder, contentOffset);
  Chat.SendMessageRequest.addMetadata(builder, metadataOffset);
  
  const endOffset = Chat.SendMessageRequest.endSendMessageRequest(builder);
  builder.finish(endOffset);

  return builder.asUint8Array();
}

/**
 * MessageBatch FlatBuffers 바이너리를 디코딩하여 JSON 친화적 구조로 역직렬화합니다.
 */
export function decodeMessageBatch(buffer: Uint8Array | ArrayBuffer): DecodedMessageBatch {
  const bb = new flatbuffers.ByteBuffer(new Uint8Array(buffer));
  const batch = Chat.MessageBatch.getRootAsMessageBatch(bb);

  const messages: DecodedMessage[] = [];
  const len = batch.messagesLength();

  for (let i = 0; i < len; i++) {
    const msg = batch.messages(i);
    if (msg) {
      messages.push({
        id: msg.id() || '',
        status: msg.status(),
        senderId: msg.senderId() || '',
        content: msg.content() || '',
        metadata: msg.metadata() || '',
        timestamp: Number(msg.timestamp()),
        eventTimestamp: Number(msg.eventTimestamp()),
      });
    }
  }

  return {
    messages,
    latestEventTimestamp: Number(batch.latestEventTimestamp()),
  };
}
