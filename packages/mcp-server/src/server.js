#!/usr/bin/env node
// MCP server that exposes the BizerOS Knowledge brain as four tools.
// Talks to $BRAIN_DIR directly via the filesystem (see src/brain.js).
// Communicates over stdio — agent harnesses launch this as a subprocess
// and pipe messages through stdin/stdout.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { listNotes, searchNotes, readNote, writeNote, getBrainDir } from './brain.js';

const TOOLS = [
  {
    name: 'list_notes',
    description:
      'List every markdown note path in the brain folder, sorted alphabetically. Use to discover what exists before writing, to avoid duplicates, and to scope a recall request.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'search_notes',
    description:
      'Find notes whose path or contents contain the query (case-insensitive substring match). Returns up to 50 hits with a one-line snippet from each. Use to recall prior context before answering and to find existing topical pages before creating new ones.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            "Substring to search for. Try the user's exact words first, then variants if the first attempt returns nothing useful."
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of hits to return. Defaults to 50.',
          default: 50,
          minimum: 1,
          maximum: 200
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'read_note',
    description:
      "Read the full markdown content of one note. Returns ok=false with error='not_found' if the file does not exist. ALWAYS call this before write_note when updating, otherwise write_note will overwrite history.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            "Relative path under the brain folder, e.g. 'daily/2026-05-09.md' or 'pages/Project Aurora.md'."
        }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'write_note',
    description:
      'Write or overwrite a markdown note at the given path. REPLACES the entire file. Creates parent directories as needed. Use [[Page Name]] syntax to cross-link related notes. For pages/ entries, follow the compiled-truth + timeline structure described in the SKILL.md.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            "Relative path under the brain folder. Must end in .md (will be appended if missing). Examples: 'daily/2026-05-09.md', 'pages/Sarah Johnson.md', 'sources/2026-05-09 transcript.md'."
        },
        content: {
          type: 'string',
          description:
            'Full markdown content of the note. This REPLACES any existing content. When updating, read_note first and pass the merged result here.'
        }
      },
      required: ['path', 'content'],
      additionalProperties: false
    }
  }
];

function toolResult(payload) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload)
      }
    ]
  };
}

export function buildServer() {
  const server = new Server(
    { name: 'bizeros-knowledge', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      switch (name) {
        case 'list_notes':
          return toolResult(await listNotes());
        case 'search_notes':
          return toolResult(await searchNotes(args.query, args.limit));
        case 'read_note':
          return toolResult(await readNote(args.path));
        case 'write_note':
          return toolResult(await writeNote(args.path, args.content));
        default:
          return toolResult({ ok: false, error: `unknown tool: ${name}` });
      }
    } catch (err) {
      return toolResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return server;
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[bizeros-knowledge-mcp] connected, BRAIN_DIR=${getBrainDir()}\n`);
}
