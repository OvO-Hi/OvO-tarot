import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

/**
 * CV 비밀번호 평문을 AES-256-GCM 으로 양방향 암호화한다.
 *
 * 키는 환경변수 CV_PASSWORD_KEY 에서 읽는다.
 *  - 32 bytes hex (64자) 또는 base64 인코딩 모두 허용
 *  - 누락 시 .env.local 가이드 에러 throw
 *
 * 저장 시 (encrypted, iv, tag) 셋을 별개 컬럼에 저장하고,
 * 빠른 매칭을 위한 lookup hash 는 SHA-256(평문) 으로 따로 보관한다.
 *  - lookup 은 keyed 가 아니라 deterministic 해시이므로,
 *    DB 만 노출돼도 평문은 풀 수 없지만 dictionary attack 위험은 있다.
 *    (CV 비밀번호는 본인이 직접 정한 사람-친화적 문자열이라 의도적으로 단순화)
 */

const KEY_ENV = 'CV_PASSWORD_KEY'

function loadKey(): Buffer {
  const raw = process.env[KEY_ENV]
  if (!raw) {
    throw new Error(
      `[cv-crypto] ${KEY_ENV} 환경변수가 설정되지 않았습니다. ` +
        `.env.local 에 32 bytes hex 키를 추가해 주세요.\n` +
        `생성 예) node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    )
  }
  // hex 64자
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  // base64
  try {
    const buf = Buffer.from(raw, 'base64')
    if (buf.length === 32) return buf
  } catch {
    /* fallthrough */
  }
  throw new Error(
    `[cv-crypto] ${KEY_ENV} 형식이 올바르지 않습니다 (32 bytes hex 또는 base64 필요).`
  )
}

export type EncryptedPayload = {
  encrypted: string // base64
  iv: string // base64
  tag: string // base64
}

export function encryptCvPassword(plaintext: string): EncryptedPayload {
  const key = loadKey()
  const iv = randomBytes(12) // GCM 권장 12 bytes
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    encrypted: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export function decryptCvPassword(payload: EncryptedPayload): string {
  const key = loadKey()
  const iv = Buffer.from(payload.iv, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')
  const enc = Buffer.from(payload.encrypted, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}

/** 비번을 빠르게 매칭하기 위한 deterministic SHA-256 hex 다이제스트 */
export function lookupHash(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}
