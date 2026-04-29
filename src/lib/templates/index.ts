import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData, Protocol } from '@/types';
import { findCatalogItem } from '@/lib/catalog';

export interface TemplateSpec {
  id: string;
  name: string;
  description: string;
  build: () => { nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] };
}

interface SeedNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  meta?: string;
  /** Group this node belongs to. x/y are still authored as absolute canvas
   *  coords for readability — the builder converts them to parent-relative. */
  parent?: string;
}

interface SeedEdge {
  id: string;
  from: string;
  to: string;
  protocol: Protocol;
  async?: boolean;
  description?: string;
}

interface SeedGroup {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tone?: string;
}

function nodesFromSeeds(
  seeds: SeedNode[],
  groups: SeedGroup[] = [],
): Node<NodeData>[] {
  const groupById = new Map(groups.map((g) => [g.id, g] as const));
  return seeds.map((s) => {
    const item = findCatalogItem(s.type);
    if (!item) {
      throw new Error(`Unknown catalog type: ${s.type}`);
    }
    const parent = s.parent ? groupById.get(s.parent) : undefined;
    const position = parent
      ? { x: s.x - parent.x, y: s.y - parent.y }
      : { x: s.x, y: s.y };
    return {
      id: s.id,
      type: 'sd',
      position,
      ...(parent
        ? { parentId: parent.id, extent: 'parent' as const }
        : {}),
      data: {
        type: s.type,
        category: item.category,
        tone: item.tone,
        label: s.label,
        meta: s.meta ?? item.description,
      },
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupsFromSeeds(seeds: SeedGroup[]): Node<any>[] {
  return seeds.map((g) => ({
    id: g.id,
    type: 'group',
    position: { x: g.x, y: g.y },
    style: { width: g.width, height: g.height },
    data: { label: g.label, tone: g.tone ?? 'edge' },
    selectable: true,
    draggable: true,
  }));
}

function edgesFromSeeds(seeds: SeedEdge[]): Edge<EdgeData>[] {
  const ASYNC: Protocol[] = ['kafka', 'amqp', 'mqtt', 'websocket'];
  return seeds.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: 'protocol',
    data: {
      protocol: e.protocol,
      async: e.async ?? ASYNC.includes(e.protocol),
      description: e.description,
    },
  }));
}

const SHOPIFY_CLONE: TemplateSpec = {
  id: 'shopify-clone',
  name: 'Shopify Clone',
  description: 'Storefront, microservices, payment, fulfillment',
  build: () => {
    const groups: SeedGroup[] = [
      { id: 'g-clients', label: 'Clients', x: 30, y: 0, width: 660, height: 130, tone: 'client' },
      { id: 'g-edge', label: 'Edge', x: 30, y: 140, width: 660, height: 110, tone: 'edge' },
      { id: 'g-services', label: 'Microservices · VPC', x: 30, y: 280, width: 660, height: 230, tone: 'service' },
      { id: 'g-data', label: 'Data Plane', x: 30, y: 540, width: 540, height: 130, tone: 'data' },
      { id: 'g-external', label: 'External', x: 710, y: 0, width: 220, height: 670, tone: 'external' },
    ];
    return {
      nodes: [
        ...groupsFromSeeds(groups),
        ...nodesFromSeeds(
          [
            { id: 'web', type: 'web', label: 'Storefront', x: 60, y: 30, parent: 'g-clients' },
            { id: 'ios', type: 'ios', label: 'iOS App', x: 260, y: 30, parent: 'g-clients' },
            { id: 'android', type: 'android', label: 'Android App', x: 460, y: 30, parent: 'g-clients' },

            { id: 'cdn', type: 'cdn', label: 'Cloudflare CDN', x: 60, y: 170, parent: 'g-edge' },
            { id: 'gw', type: 'gateway', label: 'API Gateway', x: 280, y: 170, meta: '4 services', parent: 'g-edge' },
            { id: 'auth', type: 'auth', label: 'Auth · OAuth', x: 510, y: 170, parent: 'g-edge' },

            { id: 'catalog', type: 'rest', label: 'Catalog API', x: 60, y: 320, meta: '8 endpoints', parent: 'g-services' },
            { id: 'cart', type: 'graphql', label: 'Cart Service', x: 270, y: 320, parent: 'g-services' },
            { id: 'orders', type: 'rest', label: 'Orders API', x: 480, y: 320, meta: '12 endpoints', parent: 'g-services' },
            { id: 'search', type: 'elastic', label: 'Search', x: 60, y: 440, parent: 'g-services' },
            { id: 'reco', type: 'llm', label: 'AI Recos', x: 270, y: 440, parent: 'g-services' },
            { id: 'ship', type: 'hangfire', label: 'Fulfillment', x: 480, y: 440, parent: 'g-services' },

            { id: 'pg', type: 'postgres', label: 'orders_db', x: 60, y: 580, meta: '8 tables', parent: 'g-data' },
            { id: 'redis', type: 'redis', label: 'cart_cache', x: 250, y: 580, meta: 'TTL 60s', parent: 'g-data' },
            { id: 'kafka', type: 'kafka', label: 'events', x: 430, y: 580, meta: 'order/cart events', parent: 'g-data' },

            { id: 'stripe', type: 'stripe', label: 'Stripe', x: 740, y: 30, parent: 'g-external' },
            { id: 'twilio', type: 'twilio', label: 'Twilio SMS', x: 740, y: 170, parent: 'g-external' },
            { id: 'sendgrid', type: 'sendgrid', label: 'SendGrid', x: 740, y: 320, parent: 'g-external' },
            { id: 'vector', type: 'vector', label: 'pgvector', x: 740, y: 440, parent: 'g-external' },
            { id: 'metrics', type: 'prometheus', label: 'Prometheus', x: 740, y: 580, parent: 'g-external' },
          ],
          groups,
        ),
      ],
    edges: edgesFromSeeds([
      { id: 'e1', from: 'web', to: 'cdn', protocol: 'rest' },
      { id: 'e2', from: 'ios', to: 'gw', protocol: 'rest' },
      { id: 'e3', from: 'android', to: 'gw', protocol: 'rest' },
      { id: 'e4', from: 'cdn', to: 'gw', protocol: 'rest' },
      { id: 'e5', from: 'gw', to: 'auth', protocol: 'rest' },
      { id: 'e6', from: 'gw', to: 'catalog', protocol: 'rest' },
      { id: 'e7', from: 'gw', to: 'cart', protocol: 'graphql' },
      { id: 'e8', from: 'gw', to: 'orders', protocol: 'rest' },
      { id: 'e9', from: 'catalog', to: 'search', protocol: 'rest' },
      { id: 'e10', from: 'catalog', to: 'reco', protocol: 'kafka', async: true },
      { id: 'e11', from: 'cart', to: 'redis', protocol: 'redis' },
      { id: 'e12', from: 'orders', to: 'pg', protocol: 'sql' },
      { id: 'e13', from: 'orders', to: 'kafka', protocol: 'kafka', async: true },
      { id: 'e14', from: 'kafka', to: 'ship', protocol: 'kafka', async: true },
      { id: 'e15', from: 'ship', to: 'sendgrid', protocol: 'rest', async: true },
      { id: 'e16', from: 'ship', to: 'twilio', protocol: 'rest', async: true },
      { id: 'e17', from: 'orders', to: 'stripe', protocol: 'rest' },
      { id: 'e18', from: 'reco', to: 'vector', protocol: 'sql' },
      { id: 'e19', from: 'orders', to: 'metrics', protocol: 'rest', async: true },
      { id: 'e20', from: 'cart', to: 'kafka', protocol: 'kafka', async: true },
    ]),
    };
  },
};

const URL_SHORTENER: TemplateSpec = {
  id: 'url-shortener',
  name: 'URL Shortener',
  description: 'Bitly tarzı: hash → URL, hot path cache',
  build: () => ({
    nodes: nodesFromSeeds([
      { id: 'web', type: 'web', label: 'Web Client', x: 60, y: 60 },
      { id: 'mobile', type: 'ios', label: 'Mobile', x: 240, y: 60 },
      { id: 'lb', type: 'lb', label: 'Load Balancer', x: 150, y: 200 },
      { id: 'api', type: 'rest', label: 'Shorten API', x: 150, y: 340, meta: 'POST /shorten · GET /:hash' },
      { id: 'cache', type: 'redis', label: 'Hash Cache', x: 380, y: 340, meta: '99% read hit' },
      { id: 'pg', type: 'postgres', label: 'urls_db', x: 150, y: 480, meta: 'urls(hash, target, owner)' },
      { id: 'analytics', type: 'kafka', label: 'click events', x: 380, y: 480 },
      { id: 'click_worker', type: 'kafka-consumer', label: 'Click Aggregator', x: 600, y: 480 },
      { id: 'ch', type: 'clickhouse', label: 'analytics_db', x: 600, y: 600 },
    ]),
    edges: edgesFromSeeds([
      { id: 'e1', from: 'web', to: 'lb', protocol: 'rest' },
      { id: 'e2', from: 'mobile', to: 'lb', protocol: 'rest' },
      { id: 'e3', from: 'lb', to: 'api', protocol: 'rest' },
      { id: 'e4', from: 'api', to: 'cache', protocol: 'redis' },
      { id: 'e5', from: 'api', to: 'pg', protocol: 'sql' },
      { id: 'e6', from: 'api', to: 'analytics', protocol: 'kafka', async: true },
      { id: 'e7', from: 'analytics', to: 'click_worker', protocol: 'kafka', async: true },
      { id: 'e8', from: 'click_worker', to: 'ch', protocol: 'sql' },
    ]),
  }),
};

const REALTIME_CHAT: TemplateSpec = {
  id: 'realtime-chat',
  name: 'Realtime Chat',
  description: 'WebSocket / SignalR + presence + Kafka fan-out',
  build: () => ({
    nodes: nodesFromSeeds([
      { id: 'web', type: 'web', label: 'Web', x: 60, y: 60 },
      { id: 'mobile', type: 'ios', label: 'Mobile', x: 240, y: 60 },
      { id: 'gw', type: 'gateway', label: 'API Gateway', x: 150, y: 200 },
      { id: 'hub', type: 'signalr', label: 'Chat Hub', x: 150, y: 340, meta: 'SignalR · 50k conn' },
      { id: 'ws', type: 'websocket', label: 'Presence WS', x: 380, y: 340 },
      { id: 'auth', type: 'auth', label: 'Auth', x: 380, y: 200 },
      { id: 'pg', type: 'postgres', label: 'chats_db', x: 60, y: 480, meta: 'rooms, messages' },
      { id: 'redis', type: 'redis', label: 'presence_cache', x: 250, y: 480 },
      { id: 'kafka', type: 'kafka', label: 'message events', x: 440, y: 480 },
      { id: 'fanout', type: 'kafka-consumer', label: 'Fan-out Worker', x: 640, y: 480 },
      { id: 'push', type: 'sendgrid', label: 'Push / Email', x: 640, y: 340 },
    ]),
    edges: edgesFromSeeds([
      { id: 'e1', from: 'web', to: 'gw', protocol: 'rest' },
      { id: 'e2', from: 'mobile', to: 'gw', protocol: 'rest' },
      { id: 'e3', from: 'gw', to: 'auth', protocol: 'rest' },
      { id: 'e4', from: 'gw', to: 'hub', protocol: 'signalr' },
      { id: 'e5', from: 'gw', to: 'ws', protocol: 'websocket', async: true },
      { id: 'e6', from: 'hub', to: 'pg', protocol: 'sql' },
      { id: 'e7', from: 'ws', to: 'redis', protocol: 'redis' },
      { id: 'e8', from: 'hub', to: 'kafka', protocol: 'kafka', async: true },
      { id: 'e9', from: 'kafka', to: 'fanout', protocol: 'kafka', async: true },
      { id: 'e10', from: 'fanout', to: 'push', protocol: 'rest', async: true },
    ]),
  }),
};

export const TEMPLATES: TemplateSpec[] = [SHOPIFY_CLONE, URL_SHORTENER, REALTIME_CHAT];

export function findTemplate(id: string): TemplateSpec | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
