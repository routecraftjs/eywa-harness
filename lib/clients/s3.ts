/**
 * S3-compatible client for the knowledge bucket.
 *
 * Wraps the AWS SDK with sensible defaults for MinIO (path-style URLs, no
 * region constraints). The harness uses this to read and write markdown
 * knowledge files. The same code runs unchanged against AWS S3, Cloudflare
 * R2, or Backblaze B2 if pointed at a different endpoint.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import matter from "gray-matter";
import { env } from "../../env.js";

const client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

const BUCKET = env.S3_KNOWLEDGE_BUCKET;

export interface KnowledgeFile {
  path: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

export interface KnowledgeIndexEntry {
  path: string;
  frontmatter: Record<string, unknown>;
  snippet: string;
}

async function streamToString(stream: unknown): Promise<string> {
  // The AWS SDK returns a Readable stream in Node and a Web ReadableStream in
  // some contexts. Handle both.
  if (stream && typeof (stream as { transformToString?: unknown }).transformToString === "function") {
    return (stream as { transformToString: () => Promise<string> }).transformToString();
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function makeSnippet(content: string, query?: string, max = 240): string {
  const trimmed = content.replace(/\r/g, "").trim();
  if (!query) {
    return trimmed.slice(0, max);
  }
  const lower = trimmed.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return trimmed.slice(0, max);
  const start = Math.max(0, idx - 60);
  return trimmed.slice(start, start + max);
}

export async function readKnowledgeFile(
  path: string,
): Promise<KnowledgeFile | null> {
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: path }),
    );
    const raw = await streamToString(res.Body);
    const parsed = matter(raw);
    return {
      path,
      frontmatter: parsed.data as Record<string, unknown>,
      content: parsed.content,
    };
  } catch (err) {
    const code = (err as { name?: string }).name;
    if (code === "NoSuchKey" || code === "NotFound") return null;
    throw err;
  }
}

export async function writeKnowledgeFile(
  path: string,
  frontmatter: Record<string, unknown>,
  content: string,
): Promise<void> {
  const body = matter.stringify(content, frontmatter);
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: path,
      Body: body,
      ContentType: "text/markdown; charset=utf-8",
    }),
  );
}

export async function appendToKnowledgeFile(
  path: string,
  section: string,
): Promise<void> {
  const existing = await readKnowledgeFile(path);
  if (!existing) {
    await writeKnowledgeFile(path, {}, section);
    return;
  }
  const newContent = `${existing.content.replace(/\s+$/, "")}\n\n${section.trim()}\n`;
  await writeKnowledgeFile(path, existing.frontmatter, newContent);
}

interface FindOptions {
  query?: string;
  tag?: string;
  limit?: number;
}

export async function findKnowledgeFiles(
  options: FindOptions = {},
): Promise<KnowledgeIndexEntry[]> {
  const { query, tag, limit = 20 } = options;
  const list = await client.send(
    new ListObjectsV2Command({ Bucket: BUCKET, MaxKeys: 1000 }),
  );
  const keys = (list.Contents ?? [])
    .map((c) => c.Key)
    .filter((k): k is string => typeof k === "string" && k.endsWith(".md"));

  const results: KnowledgeIndexEntry[] = [];
  for (const key of keys) {
    const file = await readKnowledgeFile(key);
    if (!file) continue;

    if (tag) {
      const tags = file.frontmatter["tags"] as string[] | string | undefined;
      const tagList = Array.isArray(tags)
        ? tags
        : typeof tags === "string"
          ? [tags]
          : [];
      if (!tagList.map((t) => t.toLowerCase()).includes(tag.toLowerCase())) {
        continue;
      }
    }

    if (query) {
      const haystack = `${JSON.stringify(file.frontmatter).toLowerCase()} ${file.content.toLowerCase()}`;
      if (!haystack.includes(query.toLowerCase())) continue;
    }

    results.push({
      path: file.path,
      frontmatter: file.frontmatter,
      snippet: makeSnippet(file.content, query),
    });

    if (results.length >= limit) break;
  }

  return results;
}

export async function ensureBucket(): Promise<void> {
  // No-op for now. The MinIO init container creates the bucket and seeds
  // it. This stub exists so capabilities can call it without caring.
  return;
}
