import { describe, it, expect } from 'vitest';
import { buildSendMessageRequest, decodeMessageBatch } from './chatUtils';
import * as flatbuffers from 'flatbuffers';
import * as Chat from './generated/chat';

describe('FlatBuffers Chat Utilities', () => {
  it('should encode SendMessageRequest successfully', () => {
    const roomId = 'room-101';
    const content = 'Hello World';
    const metadata = 'test-meta';

    const buffer = buildSendMessageRequest(roomId, content, metadata);
    expect(buffer).toBeInstanceOf(Uint8Array);

    // 디코딩하여 검증
    const bb = new flatbuffers.ByteBuffer(buffer);
    const request = Chat.SendMessageRequest.getRootAsSendMessageRequest(bb);

    expect(request.roomId()).toBe(roomId);
    expect(request.content()).toBe(content);
    expect(request.metadata()).toBe(metadata);
  });

  it('should decode MessageBatch successfully', () => {
    // 테스트용 MessageBatch 바이너리 빌드
    const builder = new flatbuffers.Builder(1024);

    const idOffset = builder.createString('msg-1');
    const senderIdOffset = builder.createString('user-1');
    const contentOffset = builder.createString('Hi there');
    const metadataOffset = builder.createString('');

    Chat.ChatMessage.startChatMessage(builder);
    Chat.ChatMessage.addId(builder, idOffset);
    Chat.ChatMessage.addStatus(builder, Chat.MessageStatus.NORMAL);
    Chat.ChatMessage.addSenderId(builder, senderIdOffset);
    Chat.ChatMessage.addContent(builder, contentOffset);
    Chat.ChatMessage.addMetadata(builder, metadataOffset);
    Chat.ChatMessage.addTimestamp(builder, BigInt(1710000000000));
    Chat.ChatMessage.addEventTimestamp(builder, BigInt(1710000000000000));
    const msgOffset = Chat.ChatMessage.endChatMessage(builder);

    const messagesVector = Chat.MessageBatch.createMessagesVector(builder, [msgOffset]);

    Chat.MessageBatch.startMessageBatch(builder);
    Chat.MessageBatch.addMessages(builder, messagesVector);
    Chat.MessageBatch.addLatestEventTimestamp(builder, BigInt(1710000000000000));
    const batchOffset = Chat.MessageBatch.endMessageBatch(builder);
    builder.finish(batchOffset);

    const batchBuffer = builder.asUint8Array();

    // 디코딩 유틸리티 호출
    const decoded = decodeMessageBatch(batchBuffer);

    expect(decoded.messages).toHaveLength(1);
    expect(decoded.messages[0].id).toBe('msg-1');
    expect(decoded.messages[0].content).toBe('Hi there');
    expect(decoded.messages[0].senderId).toBe('user-1');
    expect(decoded.latestEventTimestamp).toBe(1710000000000000);
  });
});
