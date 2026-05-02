import type { Edge, Node } from '@xyflow/react';
import type {
  ApiSpec,
  ArchitectureNotesSpec,
  ConsumingSpec,
  DbSchema,
  DtoField,
  EdgeCriticality,
  EdgeData,
  NodeData,
  ProducingSpec,
  Protocol,
  ReliabilitySpec,
  ScheduledSpec,
} from '@/types';
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
  parent?: string;
  schema?: DbSchema;
  api?: ApiSpec;
  consuming?: ConsumingSpec;
  scheduled?: ScheduledSpec;
  producing?: ProducingSpec;
  reliability?: ReliabilitySpec;
  architectureNotes?: ArchitectureNotesSpec;
  notes?: string;
}

interface SeedEdge {
  id: string;
  from: string;
  to: string;
  protocol: Protocol;
  async?: boolean;
  description?: string;
  /** Per-edge p99 latency hint (ms). Falls back to PROTOCOL_LATENCY_MS otherwise. */
  latencyMsHint?: number;
  /** Drives critical-path + bottleneck weighting. Default = 'normal'. */
  criticality?: EdgeCriticality;
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

const field = (
  name: string,
  type: string,
  description?: string,
  optional = false,
): DtoField => ({
  name,
  type,
  ...(optional ? { optional: true } : {}),
  ...(description ? { description } : {}),
});

const architect = (
  summary: string,
  designPatterns: string[],
  capTradeoffs: string[],
  operationalRisks: string[],
  recommendations: string[],
): ArchitectureNotesSpec => ({
  summary,
  designPatterns,
  capTradeoffs,
  operationalRisks,
  recommendations,
});

function architectureNotesToMarkdown(notes: ArchitectureNotesSpec): string {
  const sections: string[] = [];
  if (notes.summary) {
    sections.push(`## Summary\n${notes.summary}`);
  }
  if (notes.designPatterns?.length) {
    sections.push(
      `## Design Patterns\n${notes.designPatterns.map((item) => `- ${item}`).join('\n')}`,
    );
  }
  if (notes.capTradeoffs?.length) {
    sections.push(
      `## CAP / PACELC\n${notes.capTradeoffs.map((item) => `- ${item}`).join('\n')}`,
    );
  }
  if (notes.operationalRisks?.length) {
    sections.push(
      `## Operational Risks\n${notes.operationalRisks.map((item) => `- ${item}`).join('\n')}`,
    );
  }
  if (notes.recommendations?.length) {
    sections.push(
      `## Recommendations\n${notes.recommendations.map((item) => `- ${item}`).join('\n')}`,
    );
  }
  return sections.join('\n\n');
}

function nodesFromSeeds(
  seeds: SeedNode[],
  groups: SeedGroup[] = [],
): Node<NodeData>[] {
  const groupById = new Map(groups.map((group) => [group.id, group] as const));
  return seeds.map((seed) => {
    const item = findCatalogItem(seed.type);
    if (!item) {
      throw new Error(`Unknown catalog type: ${seed.type}`);
    }
    const parent = seed.parent ? groupById.get(seed.parent) : undefined;
    const position = parent
      ? { x: seed.x - parent.x, y: seed.y - parent.y }
      : { x: seed.x, y: seed.y };
    const notes =
      seed.notes ??
      (seed.architectureNotes
        ? architectureNotesToMarkdown(seed.architectureNotes)
        : undefined);
    return {
      id: seed.id,
      type: 'sd',
      position,
      ...(parent ? { parentId: parent.id } : {}),
      data: {
        type: seed.type,
        category: item.category,
        tone: item.tone,
        label: seed.label,
        meta: seed.meta ?? item.description,
        ...(seed.schema ? { schema: seed.schema } : {}),
        ...(seed.api ? { api: seed.api } : {}),
        ...(seed.consuming ? { consuming: seed.consuming } : {}),
        ...(seed.scheduled ? { scheduled: seed.scheduled } : {}),
        ...(seed.producing ? { producing: seed.producing } : {}),
        ...(seed.reliability ? { reliability: seed.reliability } : {}),
        ...(seed.architectureNotes
          ? { architectureNotes: seed.architectureNotes }
          : {}),
        ...(notes ? { notes } : {}),
      },
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupsFromSeeds(seeds: SeedGroup[]): Node<any>[] {
  return seeds.map((group) => ({
    id: group.id,
    type: 'group',
    position: { x: group.x, y: group.y },
    style: { width: group.width, height: group.height },
    data: { label: group.label, tone: group.tone ?? 'edge' },
    selectable: true,
    draggable: true,
  }));
}

function edgesFromSeeds(seeds: SeedEdge[]): Edge<EdgeData>[] {
  const asyncByDefault: Protocol[] = ['kafka', 'amqp', 'mqtt', 'websocket'];
  return seeds.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: 'protocol',
    data: {
      protocol: edge.protocol,
      async: edge.async ?? asyncByDefault.includes(edge.protocol),
      description: edge.description,
      ...(edge.latencyMsHint !== undefined ? { latencyMsHint: edge.latencyMsHint } : {}),
      ...(edge.criticality ? { criticality: edge.criticality } : {}),
    },
  }));
}

/* -------------------------------------------------------------------------- */
/*                         Shopify Commerce Platform                          */
/* -------------------------------------------------------------------------- */

const SHOPIFY_CATALOG_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'products',
      columns: [
        field('id', 'uuid'),
        field('merchant_id', 'uuid', 'Owning merchant workspace'),
        field('title', 'varchar(180)'),
        field('slug', 'varchar(180)'),
        field('status', 'varchar(24)', 'draft | active | archived'),
        field('default_currency', 'char(3)'),
        field('created_at', 'timestamp'),
        field('updated_at', 'timestamp'),
      ].map((dto) => ({
        name: dto.name,
        type: dto.type,
        nullable: false,
        primaryKey: dto.name === 'id',
      })),
      indexes: [
        { name: 'products_slug_idx', columns: ['slug'], unique: true },
        { name: 'products_merchant_status_idx', columns: ['merchant_id', 'status'], unique: false },
      ],
    },
    {
      name: 'product_variants',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'product_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'products', column: 'id' } },
        { name: 'sku', type: 'varchar(64)', nullable: false, primaryKey: false, unique: true },
        { name: 'title', type: 'varchar(160)', nullable: false, primaryKey: false },
        { name: 'price_cents', type: 'integer', nullable: false, primaryKey: false },
        { name: 'compare_at_cents', type: 'integer', nullable: true, primaryKey: false },
        { name: 'inventory_policy', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'deny'" },
      ],
      indexes: [
        { name: 'variants_product_idx', columns: ['product_id'], unique: false },
      ],
    },
    {
      name: 'inventory_levels',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'variant_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'product_variants', column: 'id' } },
        { name: 'location_code', type: 'varchar(32)', nullable: false, primaryKey: false },
        { name: 'available_qty', type: 'integer', nullable: false, primaryKey: false, default: '0' },
        { name: 'reserved_qty', type: 'integer', nullable: false, primaryKey: false, default: '0' },
        { name: 'updated_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [
        { name: 'inventory_variant_location_unique', columns: ['variant_id', 'location_code'], unique: true },
      ],
    },
    {
      name: 'collections',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'handle', type: 'varchar(80)', nullable: false, primaryKey: false, unique: true },
        { name: 'title', type: 'varchar(160)', nullable: false, primaryKey: false },
        { name: 'merchandising_rule', type: 'jsonb', nullable: true, primaryKey: false },
        { name: 'published_at', type: 'timestamp', nullable: true, primaryKey: false },
      ],
      indexes: [],
    },
  ],
};

const SHOPIFY_ORDER_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'customers',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'varchar(255)', nullable: false, primaryKey: false, unique: true },
        { name: 'full_name', type: 'varchar(160)', nullable: false, primaryKey: false },
        { name: 'marketing_opt_in', type: 'boolean', nullable: false, primaryKey: false, default: 'false' },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [
        { name: 'customers_email_idx', columns: ['email'], unique: true },
      ],
    },
    {
      name: 'carts',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'customer_id', type: 'uuid', nullable: true, primaryKey: false, foreignKey: { table: 'customers', column: 'id' } },
        { name: 'currency', type: 'char(3)', nullable: false, primaryKey: false },
        { name: 'status', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'active'" },
        { name: 'subtotal_cents', type: 'integer', nullable: false, primaryKey: false, default: '0' },
        { name: 'expires_at', type: 'timestamp', nullable: true, primaryKey: false },
        { name: 'updated_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [{ name: 'carts_customer_status_idx', columns: ['customer_id', 'status'], unique: false }],
    },
    {
      name: 'cart_items',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'cart_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'carts', column: 'id' } },
        { name: 'variant_id', type: 'uuid', nullable: false, primaryKey: false },
        { name: 'quantity', type: 'integer', nullable: false, primaryKey: false },
        { name: 'unit_price_cents', type: 'integer', nullable: false, primaryKey: false },
        { name: 'metadata', type: 'jsonb', nullable: true, primaryKey: false },
      ],
      indexes: [{ name: 'cart_items_cart_idx', columns: ['cart_id'], unique: false }],
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'customer_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'customers', column: 'id' } },
        { name: 'cart_id', type: 'uuid', nullable: true, primaryKey: false, foreignKey: { table: 'carts', column: 'id' } },
        { name: 'order_number', type: 'varchar(32)', nullable: false, primaryKey: false, unique: true },
        { name: 'status', type: 'varchar(32)', nullable: false, primaryKey: false, default: "'pending_payment'" },
        { name: 'payment_status', type: 'varchar(32)', nullable: false, primaryKey: false, default: "'pending'" },
        { name: 'fulfillment_status', type: 'varchar(32)', nullable: false, primaryKey: false, default: "'unfulfilled'" },
        { name: 'total_cents', type: 'integer', nullable: false, primaryKey: false },
        { name: 'placed_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [
        { name: 'orders_number_idx', columns: ['order_number'], unique: true },
        { name: 'orders_customer_placed_idx', columns: ['customer_id', 'placed_at'], unique: false },
      ],
    },
    {
      name: 'payments',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'order_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'orders', column: 'id' } },
        { name: 'provider', type: 'varchar(24)', nullable: false, primaryKey: false },
        { name: 'provider_ref', type: 'varchar(80)', nullable: false, primaryKey: false, unique: true },
        { name: 'status', type: 'varchar(24)', nullable: false, primaryKey: false },
        { name: 'amount_cents', type: 'integer', nullable: false, primaryKey: false },
        { name: 'authorized_at', type: 'timestamp', nullable: true, primaryKey: false },
        { name: 'captured_at', type: 'timestamp', nullable: true, primaryKey: false },
      ],
      indexes: [
        { name: 'payments_order_idx', columns: ['order_id'], unique: false },
      ],
    },
    {
      name: 'shipments',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'order_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'orders', column: 'id' } },
        { name: 'carrier', type: 'varchar(48)', nullable: false, primaryKey: false },
        { name: 'tracking_number', type: 'varchar(96)', nullable: true, primaryKey: false },
        { name: 'status', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'label_pending'" },
        { name: 'shipped_at', type: 'timestamp', nullable: true, primaryKey: false },
        { name: 'eta_at', type: 'timestamp', nullable: true, primaryKey: false },
      ],
      indexes: [
        { name: 'shipments_order_idx', columns: ['order_id'], unique: false },
      ],
    },
    {
      name: 'outbox_events',
      columns: [
        { name: 'id', type: 'bigserial', nullable: false, primaryKey: true },
        { name: 'aggregate_type', type: 'varchar(32)', nullable: false, primaryKey: false },
        { name: 'aggregate_id', type: 'uuid', nullable: false, primaryKey: false },
        { name: 'event_name', type: 'varchar(64)', nullable: false, primaryKey: false },
        { name: 'payload', type: 'jsonb', nullable: false, primaryKey: false },
        { name: 'published_at', type: 'timestamp', nullable: true, primaryKey: false },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [
        { name: 'outbox_unpublished_idx', columns: ['published_at'], unique: false },
      ],
    },
  ],
};

const SHOPIFY_SEARCH_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'product_documents',
      columns: [
        { name: 'product_id', type: 'keyword', nullable: false, primaryKey: true },
        { name: 'title', type: 'text', nullable: false, primaryKey: false },
        { name: 'category_path', type: 'keyword[]', nullable: false, primaryKey: false },
        { name: 'price_cents', type: 'integer', nullable: false, primaryKey: false },
        { name: 'tags', type: 'keyword[]', nullable: true, primaryKey: false },
        { name: 'updated_at', type: 'date', nullable: false, primaryKey: false },
      ],
      indexes: [
        { name: 'product_docs_title_search', columns: ['title'], unique: false },
      ],
    },
    {
      name: 'query_insights',
      columns: [
        { name: 'query', type: 'keyword', nullable: false, primaryKey: true },
        { name: 'day', type: 'date', nullable: false, primaryKey: true },
        { name: 'searches', type: 'integer', nullable: false, primaryKey: false },
        { name: 'conversions', type: 'integer', nullable: false, primaryKey: false },
      ],
      indexes: [],
    },
  ],
};

const SHOPIFY_VECTOR_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'product_embeddings',
      columns: [
        { name: 'product_id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'embedding', type: 'vector(1536)', nullable: false, primaryKey: false },
        { name: 'source_snapshot_at', type: 'timestamp', nullable: false, primaryKey: false },
        { name: 'locale', type: 'varchar(10)', nullable: false, primaryKey: false },
      ],
      indexes: [{ name: 'product_embedding_ann', columns: ['embedding'], unique: false }],
    },
    {
      name: 'recommendation_feedback',
      columns: [
        { name: 'id', type: 'bigserial', nullable: false, primaryKey: true },
        { name: 'customer_id', type: 'uuid', nullable: true, primaryKey: false },
        { name: 'product_id', type: 'uuid', nullable: false, primaryKey: false },
        { name: 'signal', type: 'varchar(24)', nullable: false, primaryKey: false },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [{ name: 'reco_feedback_product_idx', columns: ['product_id'], unique: false }],
    },
  ],
};

const SHOPIFY_GATEWAY_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://shop.example.com/api',
      endpoints: [
        {
          method: 'GET',
          path: '/storefront/home',
          description: 'Bootstrap storefront for cached landing pages.',
          request: [field('locale', 'string', 'RFC-5646 locale code', true)],
          response: [
            field('heroBanners', 'Banner[]'),
            field('featuredCollectionIds', 'string[]'),
            field('cartId', 'uuid', 'Anonymous or customer cart', true),
          ],
          statusCodes: ['200'],
        },
        {
          method: 'GET',
          path: '/products',
          description: 'Faceted catalog search proxied to Search + Catalog.',
          request: [
            field('query', 'string', 'User search query', true),
            field('collection', 'string', 'Collection handle', true),
            field('cursor', 'string', 'Pagination cursor', true),
          ],
          response: [
            field('items', 'ProductCard[]'),
            field('nextCursor', 'string', 'Opaque pagination cursor', true),
          ],
          statusCodes: ['200'],
        },
        {
          method: 'GET',
          path: '/products/:slug',
          description: 'Hydrated product detail page.',
          response: [
            field('product', 'ProductDetail'),
            field('recommendedProductIds', 'uuid[]'),
          ],
          statusCodes: ['200', '404'],
        },
        {
          method: 'POST',
          path: '/cart/items',
          description: 'Adds or increments a cart line.',
          request: [
            field('cartId', 'uuid', 'Anonymous or customer cart ID'),
            field('variantId', 'uuid'),
            field('quantity', 'integer'),
          ],
          response: [
            field('cartId', 'uuid'),
            field('itemCount', 'integer'),
            field('subtotalCents', 'integer'),
          ],
          statusCodes: ['200', '409'],
        },
        {
          method: 'POST',
          path: '/checkout/confirm',
          description: 'Creates the order after payment authorization.',
          request: [
            field('cartId', 'uuid'),
            field('paymentMethodId', 'string'),
            field('shippingAddress', 'AddressInput'),
          ],
          response: [
            field('orderId', 'uuid'),
            field('orderNumber', 'string'),
            field('paymentStatus', 'string'),
          ],
          statusCodes: ['201', '402', '409'],
        },
      ],
    },
  ],
};

const SHOPIFY_AUTH_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://accounts.shop.example.com',
      endpoints: [
        {
          method: 'POST',
          path: '/oauth/login',
          description: 'Exchange OAuth code for customer tokens.',
          request: [
            field('provider', 'string'),
            field('code', 'string'),
            field('redirectUri', 'string'),
          ],
          response: [
            field('accessToken', 'jwt'),
            field('refreshToken', 'jwt'),
            field('customerId', 'uuid'),
            field('expiresInSec', 'integer'),
          ],
          statusCodes: ['200', '401'],
        },
        {
          method: 'POST',
          path: '/tokens/refresh',
          request: [field('refreshToken', 'jwt')],
          response: [
            field('accessToken', 'jwt'),
            field('expiresInSec', 'integer'),
          ],
          statusCodes: ['200', '401'],
        },
        {
          method: 'GET',
          path: '/me',
          response: [
            field('customerId', 'uuid'),
            field('email', 'string'),
            field('segments', 'string[]'),
          ],
          statusCodes: ['200', '401'],
        },
      ],
    },
  ],
};

const SHOPIFY_CATALOG_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://catalog.shop.svc.cluster.local',
      endpoints: [
        {
          method: 'GET',
          path: '/products',
          request: [
            field('query', 'string', 'Search term', true),
            field('collectionId', 'uuid', 'Collection filter', true),
            field('merchantId', 'uuid', 'Merchant scope', true),
          ],
          response: [
            field('products', 'CatalogProduct[]'),
            field('facets', 'FacetBucket[]'),
          ],
          statusCodes: ['200'],
        },
        {
          method: 'GET',
          path: '/products/:id',
          response: [
            field('product', 'CatalogProductDetail'),
            field('variants', 'VariantSummary[]'),
            field('inventory', 'InventorySnapshot[]'),
          ],
          statusCodes: ['200', '404'],
        },
        {
          method: 'GET',
          path: '/collections/:handle',
          response: [
            field('collectionId', 'uuid'),
            field('title', 'string'),
            field('productIds', 'uuid[]'),
          ],
          statusCodes: ['200', '404'],
        },
      ],
    },
  ],
};

const SHOPIFY_CART_API: ApiSpec = {
  protocols: [
    {
      kind: 'graphql',
      baseUrl: 'https://cart.shop.example.com/graphql',
      endpoints: [
        {
          name: 'Query cart(cartId: ID!)',
          description: 'Returns calculated cart totals plus promotion state.',
          request: [field('cartId', 'uuid')],
          response: [
            field('cart', 'CartPayload'),
            field('warnings', 'CartWarning[]'),
          ],
        },
        {
          name: 'Mutation addCartItem(input: AddCartItemInput!)',
          request: [
            field('cartId', 'uuid'),
            field('variantId', 'uuid'),
            field('quantity', 'integer'),
          ],
          response: [
            field('cartId', 'uuid'),
            field('lines', 'CartLine[]'),
            field('subtotalCents', 'integer'),
          ],
        },
        {
          name: 'Mutation applyDiscount(input: ApplyDiscountInput!)',
          request: [
            field('cartId', 'uuid'),
            field('code', 'string'),
          ],
          response: [
            field('cartId', 'uuid'),
            field('appliedDiscounts', 'DiscountLine[]'),
          ],
        },
      ],
    },
  ],
};

const SHOPIFY_CHECKOUT_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://checkout.shop.svc.cluster.local',
      endpoints: [
        {
          method: 'POST',
          path: '/orders/quote',
          description: 'Tax and shipping quote before order placement.',
          request: [
            field('cartId', 'uuid'),
            field('shippingAddress', 'AddressInput'),
          ],
          response: [
            field('subtotalCents', 'integer'),
            field('shippingCents', 'integer'),
            field('taxCents', 'integer'),
            field('grandTotalCents', 'integer'),
          ],
          statusCodes: ['200', '409'],
        },
        {
          method: 'POST',
          path: '/orders',
          description:
            'Creates order, reserves inventory via outbox, and starts checkout saga. Idempotent: replay returns the original order.',
          request: [
            field(
              'idempotencyKey',
              'uuid',
              'Header `Idempotency-Key`. Replays within 24h return the cached terminal response.',
            ),
            field('cartId', 'uuid'),
            field('paymentIntentId', 'string'),
            field('shippingAddress', 'AddressInput'),
          ],
          response: [
            field('orderId', 'uuid'),
            field('orderNumber', 'string'),
            field('status', 'string'),
            field('sagaId', 'uuid', 'Tracks the multi-step saga progress.'),
          ],
          statusCodes: ['201', '402', '409'],
        },
        {
          method: 'GET',
          path: '/orders/:orderId',
          response: [
            field('orderId', 'uuid'),
            field('status', 'string'),
            field('fulfillmentStatus', 'string'),
            field('trackingNumber', 'string', 'Carrier tracking number', true),
          ],
          statusCodes: ['200', '404'],
        },
      ],
    },
  ],
};

const SHOPIFY_RECO_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://reco.shop.svc.cluster.local',
      endpoints: [
        {
          method: 'GET',
          path: '/recommendations/home',
          request: [
            field('customerId', 'uuid', 'Known customer identifier', true),
            field('seedProductId', 'uuid', 'Contextual product seed', true),
            field('limit', 'integer', 'Max cards to return', true),
          ],
          response: [
            field('items', 'RecommendationCard[]'),
            field('modelVersion', 'string'),
          ],
          statusCodes: ['200'],
        },
        {
          method: 'POST',
          path: '/recommendations/feedback',
          description: 'Implicit and explicit feedback for reranking.',
          request: [
            field('customerId', 'uuid', 'Known customer identifier', true),
            field('productId', 'uuid'),
            field('signal', 'string', 'view | click | add_to_cart | dismiss'),
          ],
          response: [field('accepted', 'boolean')],
          statusCodes: ['202'],
        },
      ],
    },
  ],
};

const SHOPIFY_KAFKA_PRODUCING: ProducingSpec = {
  events: [
    {
      name: 'CartUpdated',
      publishers: ['cart'],
      fields: [
        field('cartId', 'uuid'),
        field('customerId', 'uuid', 'Anonymous carts omit this field', true),
        field('subtotalCents', 'integer'),
        field('updatedAt', 'timestamp'),
      ],
      description: 'Used for remarketing, recovery, and inventory recalculation.',
    },
    {
      name: 'OrderPlaced',
      publishers: ['checkout'],
      fields: [
        field('orderId', 'uuid'),
        field('customerId', 'uuid'),
        field('totalCents', 'integer'),
        field('paymentProviderRef', 'string'),
      ],
      description: 'Triggers fulfillment, customer comms, and analytics sinks.',
    },
    {
      name: 'InventoryReserved',
      publishers: ['checkout', 'catalog'],
      fields: [
        field('orderId', 'uuid'),
        field('variantId', 'uuid'),
        field('quantity', 'integer'),
      ],
    },
  ],
};

const SHOPIFY_FULFILLMENT_CONSUMING: ConsumingSpec = {
  sourceNodeId: 'events',
  handler: 'reserve_stock_and_create_shipment',
  concurrency: 8,
  notes:
    'Consumes OrderPlaced and InventoryReserved with idempotency keyed by orderId. Retries are exponential and poison messages are routed to a DLQ outside this diagram.',
};

const SHOPIFY_RECONCILE_SCHEDULED: ScheduledSpec = {
  schedule: '0 */2 * * *',
  handler: 'reconcile_shipments_and_payment_captures',
  description:
    'Periodic recovery for missed webhooks and eventual consistency gaps between Stripe, carrier APIs, and local order state.',
  timezone: 'UTC',
};

const SHOPIFY_OUTBOX_PUBLISHER_CONSUMING: ConsumingSpec = {
  sourceNodeId: 'order-db',
  handler: 'publish_outbox_to_kafka',
  concurrency: 2,
  deadLetterNodeId: 'dlq-events',
  notes:
    'Polls orders_db.outbox_events every 100ms (advisory_lock, single active publisher). Idempotent via event_id UUID. SLI: rows where published_at IS NULL — alert at depth > 10k.',
};

const SHOPIFY_SEARCH_INDEXER_CONSUMING: ConsumingSpec = {
  sourceNodeId: 'events',
  handler: 'project_catalog_to_search',
  concurrency: 6,
  deadLetterNodeId: 'dlq-events',
  notes:
    'Consumes ProductUpdated + InventoryReserved with dedup key (event_id, document_version). Consumer-group lag SLI < 30s; full crawl every 24h as safety net.',
};

const SHOPIFY_SAGA_API: ApiSpec = {
  protocols: [
    {
      kind: 'grpc',
      baseUrl: 'saga.shop.svc.cluster.local:9090',
      endpoints: [
        {
          name: 'CheckoutSaga.Begin',
          description:
            'Starts saga: ReserveInventory → ChargePayment → CreateShipment with compensations.',
          request: [
            field('orderId', 'uuid'),
            field(
              'idempotencyKey',
              'uuid',
              'Client-supplied; replays return cached terminal state.',
            ),
            field('reservationLines', 'ReservationLine[]'),
          ],
          response: [
            field('sagaId', 'uuid'),
            field(
              'state',
              'string',
              'started | inventory_reserved | charged | completed | compensated',
            ),
          ],
          statusCodes: ['202', '409'],
        },
        {
          name: 'CheckoutSaga.Compensate',
          description: 'Reverse-order compensations on a failed saga step.',
          request: [field('sagaId', 'uuid'), field('reason', 'string')],
          response: [field('compensated', 'boolean')],
          statusCodes: ['200', '404'],
        },
      ],
    },
  ],
};

const SHOPIFY_STRIPE_WEBHOOK_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://hooks.shop.example.com',
      endpoints: [
        {
          method: 'POST',
          path: '/stripe/events',
          description:
            'Receives Stripe webhooks. Verifies HMAC, enqueues to Kafka, acks within 200ms.',
          request: [
            field(
              'stripeSignature',
              'string',
              'Header `Stripe-Signature`; HMAC-SHA256 over payload.',
            ),
            field(
              'idempotencyKey',
              'uuid',
              'Stripe `event.id` reused as the dedup key; duplicate events return 200.',
            ),
            field('payload', 'StripeEvent'),
          ],
          response: [field('accepted', 'boolean')],
          statusCodes: ['200', '400', '401'],
        },
      ],
    },
  ],
};

const SHOPIFY_CLONE: TemplateSpec = {
  id: 'shopify-clone',
  name: 'Commerce Platform',
  description: 'DTO-complete commerce reference with clear data ownership and async boundaries',
  build: () => {
    const groups: SeedGroup[] = [
      { id: 'clients', label: 'Clients', x: 30, y: 10, width: 670, height: 120, tone: 'client' },
      { id: 'edge', label: 'Edge', x: 30, y: 150, width: 670, height: 110, tone: 'edge' },
      { id: 'core', label: 'Core Services', x: 30, y: 280, width: 670, height: 360, tone: 'service' },
      { id: 'data', label: 'Data and Async Backbone', x: 30, y: 660, width: 670, height: 240, tone: 'data' },
      { id: 'external', label: 'External and Ops', x: 730, y: 10, width: 260, height: 890, tone: 'external' },
    ];

    return {
      nodes: [
        ...groupsFromSeeds(groups),
        ...nodesFromSeeds(
          [
            {
              id: 'web',
              type: 'web',
              label: 'Storefront Web',
              x: 60,
              y: 40,
              parent: 'clients',
              meta: 'SSR + CDN cached',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 220, availability: 0.999 },
                replicas: 6,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Edge-rendered storefront optimized for cache hit ratio and graceful degradation when recommendation or cart side calls are slow.',
                ['Backend-for-frontend', 'Stale-while-revalidate', 'Feature flags'],
                ['Favors availability and low latency over perfectly fresh merchandising content on anonymous pages.'],
                ['Too many blocking origin calls will collapse TTFB during promo bursts.'],
                ['Keep home/category pages cacheable and fetch customer-specific widgets asynchronously.'],
              ),
            },
            {
              id: 'ios',
              type: 'ios',
              label: 'iOS App',
              x: 275,
              y: 40,
              parent: 'clients',
              meta: 'Native checkout + wallet',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 280, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Mobile client keeps authenticated flows resilient by hydrating core surfaces from cached snapshots and replaying mutations when the network recovers.',
                ['Offline-first cache', 'Token refresh middleware'],
                ['Read freshness may lag on product availability, but mutation retries prioritize completion over strict recency.'],
                ['Silent refresh loops can amplify auth load during incident windows.'],
                ['Separate product discovery cache TTL from cart mutation retry policy.'],
              ),
            },
            {
              id: 'android',
              type: 'android',
              label: 'Android App',
              x: 490,
              y: 40,
              parent: 'clients',
              meta: 'Play billing friendly',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 280, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Android shares the same contract surface as iOS and should stay thin on orchestration to keep API compatibility predictable.',
                ['Shared API contract', 'Optimistic UI'],
                ['Short-term divergence in cart badges is acceptable if writes converge server-side.'],
                ['Fragmented client contract versions complicate gateway transformations.'],
                ['Version DTOs conservatively and keep field additions backwards compatible.'],
              ),
            },

            {
              id: 'cdn',
              type: 'cdn',
              label: 'Edge CDN',
              x: 60,
              y: 185,
              parent: 'edge',
              meta: 'WAF + image cache',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 60, availability: 0.9999 },
                replicas: 20,
                redundancy: 'multi-region',
              },
              architectureNotes: architect(
                'Terminates TLS, enforces bot controls, and shields origin services from marketing-driven read spikes.',
                ['CDN cache hierarchy', 'Origin shielding', 'WAF'],
                ['Aggressive caching prefers latency and edge availability over immediate purge propagation.'],
                ['Cache invalidation lag can surface stale price or stock snippets during flash sales.'],
                ['Purge by tag and route checkout/auth paths around CDN content caches.'],
              ),
            },
            {
              id: 'gw',
              type: 'gateway',
              label: 'Storefront Gateway',
              x: 285,
              y: 185,
              parent: 'edge',
              meta: 'REST facade · 5 flows',
              api: SHOPIFY_GATEWAY_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EL',
                consistencyModel: 'read-your-writes',
                slo: { latencyP99Ms: 180, availability: 0.9995, rpsTarget: 8000 },
                replicas: 6,
                redundancy: 'active-active',
                failureModes: ['Downstream timeout fan-out', 'JWT issuer unavailability'],
              },
              architectureNotes: architect(
                'The gateway is a BFF that composes product, cart, and checkout contracts without owning durable data.',
                ['Backend-for-frontend', 'Request hedging', 'Timeout budgets'],
                ['Uses strict auth and checkout consistency while tolerating stale recommendation or merchandising widgets.'],
                ['Unchecked fan-out or large DTO expansion will dominate p99 latency.'],
                ['Set per-downstream budgets and fail recommendation/search widgets open.'],
              ),
            },
            {
              id: 'auth',
              type: 'auth',
              label: 'Identity and OAuth',
              x: 515,
              y: 185,
              parent: 'edge',
              meta: 'OAuth + token refresh',
              api: SHOPIFY_AUTH_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 160, availability: 0.9995 },
                replicas: 4,
                redundancy: 'active-active',
                failureModes: ['Provider callback delays', 'Key rotation mismatch'],
              },
              architectureNotes: architect(
                'Central identity service issues short-lived access tokens and isolates third-party OAuth provider churn from application services.',
                ['Token service', 'Short-lived JWT + refresh token pair', 'Key rotation'],
                ['Chooses stronger consistency for refresh token revocation even if provider logins briefly queue.'],
                ['Revocation lag or skewed JWKS rollout can log users out globally.'],
                ['Automate JWKS rotation and keep provider-specific circuit breakers.'],
              ),
            },

            {
              id: 'catalog',
              type: 'service',
              label: 'Catalog Service',
              x: 60,
              y: 325,
              parent: 'core',
              meta: 'Product source of truth',
              api: SHOPIFY_CATALOG_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EL',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 140, availability: 0.999 },
                replicas: 4,
                redundancy: 'active-active',
                failureModes: ['Inventory reservation lag', 'Bulk catalog import contention'],
              },
              architectureNotes: architect(
                'Owns merchant-editable product metadata and emits domain events that downstream read models consume.',
                ['Database per service', 'Transactional outbox', 'CQRS read models'],
                ['Catalog writes are CP because merchants must not see partial product states after publish actions.'],
                ['Large merchandising imports can starve interactive writes if outbox and OLTP share resources.'],
                ['Keep admin imports on separate worker pools and project to search asynchronously.'],
              ),
            },
            {
              id: 'cart',
              type: 'graphql',
              label: 'Cart Service',
              x: 275,
              y: 325,
              parent: 'core',
              meta: 'GraphQL mutation hub',
              api: SHOPIFY_CART_API,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'read-your-writes',
                slo: { latencyP99Ms: 120, availability: 0.9995 },
                replicas: 5,
                redundancy: 'active-active',
                failureModes: ['Cache stampede on cart hydrate', 'Duplicate mutation replay'],
              },
              architectureNotes: architect(
                'Cart prioritizes responsiveness and uses Redis-backed session state with durable projection into the order domain before checkout.',
                ['GraphQL facade', 'Cache-aside', 'Idempotency keys'],
                ['Temporary cart state can trade perfect cross-device consistency for lower latency and higher availability.'],
                ['Without mutation dedupe, mobile retries can create duplicate lines or coupon churn.'],
                ['Require idempotency keys for add/apply-discount mutations and expire abandoned carts aggressively.'],
              ),
            },
            {
              id: 'checkout',
              type: 'service',
              label: 'Checkout Service',
              x: 490,
              y: 325,
              parent: 'core',
              meta: 'Order + payment orchestration',
              api: SHOPIFY_CHECKOUT_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 220, availability: 0.9995, rpsTarget: 1800 },
                replicas: 4,
                redundancy: 'active-active',
                failureModes: ['Stripe auth timeout', 'Inventory over-sell under retries'],
              },
              architectureNotes: architect(
                'Checkout is the consistency anchor for payment authorization, order persistence, and inventory reservation side effects.',
                ['Saga orchestration', 'Transactional outbox', 'Idempotent command handlers'],
                ['Favors consistency over latency because duplicate charges or oversold inventory are costlier than slower confirmation pages.'],
                ['Third-party payment tail latency and webhook races can leave orders in limbo.'],
                ['Persist payment intent state locally and reconcile via outbox plus periodic recovery jobs.'],
              ),
            },
            {
              id: 'search',
              type: 'elastic',
              label: 'Search Index',
              x: 60,
              y: 455,
              parent: 'core',
              meta: 'Facets + typo tolerance',
              schema: SHOPIFY_SEARCH_SCHEMA,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 90, availability: 0.999 },
                replicas: 3,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Search is a derived read model fed asynchronously from the catalog domain and optimized for query latency, not write authority.',
                ['CQRS read model', 'Denormalized document index'],
                ['Accepts eventual consistency so the site keeps answering searches during reindex or catalog projection lag.'],
                ['Projection lag can surface unpublished products or stale stock labels.'],
                ['Tag documents with source version and filter on publish state during indexing.'],
              ),
            },
            {
              id: 'reco',
              type: 'llm',
              label: 'Recommendation Service',
              x: 275,
              y: 455,
              parent: 'core',
              meta: 'Feature retrieval + rerank',
              api: SHOPIFY_RECO_API,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 150, availability: 0.995 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Embedding lag', 'Cold-start fallback saturation'],
              },
              architectureNotes: architect(
                'Recommendation uses vector retrieval plus lightweight reranking and should always degrade to deterministic merchandising instead of blocking checkout or PDP loads.',
                ['Vector search', 'Fallback strategy', 'Feature store snapshotting'],
                ['Trading freshness for latency is acceptable because recommendations are advisory, not transactional.'],
                ['Model or embedding drift can hurt conversion silently if feedback loops are not monitored.'],
                ['Keep a deterministic fallback list and monitor CTR by model version.'],
              ),
            },
            {
              id: 'fulfillment',
              type: 'consumer',
              label: 'Fulfillment Worker',
              x: 490,
              y: 455,
              parent: 'core',
              meta: 'Shipment creation',
              consuming: SHOPIFY_FULFILLMENT_CONSUMING,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EC',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 3000, availability: 0.999 },
                replicas: 6,
                redundancy: 'active-active',
                failureModes: ['Carrier API outage', 'Poison event replay'],
              },
              architectureNotes: architect(
                'Worker consumes order events asynchronously so carrier and communication latency never blocks the checkout command path.',
                ['Event-driven consumer', 'Inbox dedupe', 'Compensating actions'],
                ['Eventual shipment creation is acceptable because customers can wait seconds for label assignment.'],
                ['Carrier outages can back up the topic and age retry queues.'],
                ['Use idempotent consumers with DLQ and alert on backlog age, not only failure count.'],
              ),
            },
            {
              id: 'outbox-publisher',
              type: 'kafka-consumer',
              label: 'Outbox Publisher',
              x: 60,
              y: 520,
              parent: 'core',
              meta: 'orders_db.outbox → Kafka',
              consuming: SHOPIFY_OUTBOX_PUBLISHER_CONSUMING,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EL',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 200, availability: 0.9995 },
                replicas: 2,
                redundancy: 'active-passive',
                failureModes: ['Publisher lag during bursts', 'Watermark advance race'],
              },
              architectureNotes: architect(
                'Decouples checkout DB transactions from Kafka publish so OrderPlaced events appear at most once and at least once via the transactional outbox.',
                ['Transactional outbox', 'At-least-once + dedup by event_id', 'Single-active publisher (advisory lock)'],
                ['Active-passive: a single leader advances the published_at watermark to avoid double-publish on race.'],
                ['Active-active duplicate publish risk if leader election races.'],
                ['Acquire pg_advisory_lock(outbox_publisher); alert on backlog > 10k rows or age > 60s.'],
              ),
              notes: 'Backlog SLI: rows where published_at IS NULL. Polling cadence 100ms; max batch 500 rows per tick. Reaper deletes published rows after 24h.',
            },
            {
              id: 'saga-orchestrator',
              type: 'service',
              label: 'Checkout Saga',
              x: 275,
              y: 520,
              parent: 'core',
              meta: 'Reserve → Charge → Ship',
              api: SHOPIFY_SAGA_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 800, availability: 0.999 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Stuck saga (timeout)', 'Compensation idempotency violation'],
              },
              architectureNotes: architect(
                'Coordinates the long-running checkout transaction across catalog (reserve), Stripe (charge), and fulfillment (ship) using compensating transactions on each step failure.',
                ['Saga (orchestrated)', 'Compensating transactions', 'Persistent saga state'],
                ['CP: saga state must be authoritative; otherwise duplicate captures or oversold inventory leak through.'],
                ['Step timeouts and partial failures (charge succeeded, reserve compensated) require careful idempotency.'],
                ['Persist saga steps in order-db; reconcile-cron retries stuck sagas after 5min watermark.'],
              ),
              notes: 'Step timeouts: reserve 5s, charge 15s (Stripe SLA), ship 30s. RTO 60s. Compensations: ReleaseInventory, RefundPayment, CancelShipment.',
            },
            {
              id: 'reconcile',
              type: 'cron',
              label: 'Recovery Scheduler',
              x: 490,
              y: 520,
              parent: 'core',
              meta: 'Webhook and shipment repair',
              scheduled: SHOPIFY_RECONCILE_SCHEDULED,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 10000, availability: 0.995 },
                replicas: 2,
                redundancy: 'active-passive',
                failureModes: ['Long-running batch overlap', 'False-positive recovery actions'],
              },
              architectureNotes: architect(
                'Periodic reconciliation closes the gap left by eventually consistent webhooks and third-party outages.',
                ['Reconciliation batch', 'Idempotent repair jobs'],
                ['Sacrifices latency for correctness by preferring slower but deterministic repair logic.'],
                ['If repair jobs are not idempotent they can resend notifications or recapture payments.'],
                ['Scope jobs by watermark and persist repair audit trails.'],
              ),
            },
            {
              id: 'search-indexer',
              type: 'kafka-consumer',
              label: 'Search Indexer',
              x: 60,
              y: 595,
              parent: 'core',
              meta: 'Kafka → Elasticsearch projection',
              consuming: SHOPIFY_SEARCH_INDEXER_CONSUMING,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 500, availability: 0.999 },
                replicas: 4,
                redundancy: 'active-active',
                failureModes: ['Index reindex backpressure', 'Schema migration during indexing'],
              },
              architectureNotes: architect(
                'Consumes catalog domain events and projects to the search read model. Decouples write authority from query latency by accepting a few seconds of lag.',
                ['CQRS projection', 'Event-driven indexer', 'Idempotent upserts'],
                ['Eventual consistency intentional — search is a derived read model, not a source of truth.'],
                ['Projection failures during schema migration can stall the index for hours.'],
                ['Use dual-write index (v1, v2) during migrations; alert on consumer lag > 60s.'],
              ),
              notes: 'Idempotency: dedupe by (event_id, document_version). Safety net: full crawl every 24h to repair drift.',
            },
            {
              id: 'stripe-webhook',
              type: 'webhook',
              label: 'Stripe Webhook',
              x: 275,
              y: 595,
              parent: 'core',
              meta: 'HMAC-verified event sink',
              api: SHOPIFY_STRIPE_WEBHOOK_API,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'read-your-writes',
                slo: { latencyP99Ms: 200, availability: 0.9995, rpsTarget: 500 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Replay attack', 'Provider-side burst exceeding 1000 RPS'],
              },
              architectureNotes: architect(
                'Receives Stripe webhooks (payment_intent.succeeded, charge.refunded, dispute.created), verifies HMAC, then enqueues to Kafka so downstream processing is async and Stripe gets a fast 200.',
                ['Webhook receiver', 'Signature verification', 'Async hand-off to Kafka'],
                ['AP: ack within 200ms so Stripe does not retry; processing is async via outbox path.'],
                ['Webhook ordering is not guaranteed; downstream must be commutative or use timestamps.'],
                ['Verify Stripe-Signature header before enqueue; deduplicate by Stripe `event.id`.'],
              ),
              notes: 'Stripe retries failed webhooks up to 3 days exponentially. SLO: ack < 200ms. Real work is enqueued to commerce_events topic.',
            },

            {
              id: 'catalog-db',
              type: 'postgres',
              label: 'catalog_db (primary)',
              x: 60,
              y: 695,
              parent: 'data',
              meta: 'Product domain OLTP — write leader',
              schema: SHOPIFY_CATALOG_SCHEMA,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 35, availability: 0.9995 },
                replicas: 3,
                redundancy: 'active-passive',
                failureModes: ['Primary failover lag', 'Long-running admin query lock amplification'],
              },
              architectureNotes: architect(
                'Dedicated catalog write leader. Reads fan out to catalog_db_ro replica so merchant publish/inventory writes keep headroom even during browse spikes.',
                ['Database per bounded context', 'Leader-replica split', 'Logical sharding by merchant_id ready'],
                ['Strong writes for publish/inventory edits; reads can be served by the async replica with bounded staleness.'],
                ['Long admin queries can block writes; replica lag bleeds into search projection lag.'],
                ['Route OLAP/admin reads to the replica; alert pg_stat_replication lag > 5s.'],
              ),
              notes: 'Partitioning roadmap: hash(merchant_id) % 16 once write QPS > 8k. Outbox table lives in orders_db, not here.',
            },
            {
              id: 'catalog-db-replica',
              type: 'postgres',
              label: 'catalog_db_ro',
              x: 60,
              y: 770,
              parent: 'data',
              meta: 'Async streaming replica · read fan-out',
              schema: SHOPIFY_CATALOG_SCHEMA,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 25, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-active',
                failureModes: ['Replication lag spike during bulk import', 'Long analytical query holds locks'],
              },
              architectureNotes: architect(
                'Streaming replica absorbs catalog browse + search-indexer reads to keep the primary free for writes.',
                ['Read replica', 'Async streaming replication', 'CQRS read path'],
                ['Trades freshness for read availability; writes still go to primary so consistency is bounded staleness (≤ 5s typical).'],
                ['Replica lag during bulk catalog imports surfaces stale stock in PDP browse.'],
                ['Reject reads on lag > 5s; route fallback to primary with budget cap.'],
              ),
              notes: 'Mode: streaming, async (wal_level=replica). Failover: promote on primary loss (manual confirm). RTO 60s, RPO ≤ 5s.',
            },
            {
              id: 'order-db',
              type: 'postgres',
              label: 'orders_db',
              x: 250,
              y: 695,
              parent: 'data',
              meta: 'Checkout + order ledger',
              schema: SHOPIFY_ORDER_SCHEMA,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 40, availability: 0.9995 },
                replicas: 3,
                redundancy: 'active-passive',
                failureModes: ['Outbox table bloat', 'Primary saturation during sale spikes'],
              },
              architectureNotes: architect(
                'Order ledger is the transactional spine of the platform and owns the outbox that feeds asynchronous side effects.',
                ['Transactional outbox', 'Immutable order ledger'],
                ['Prefers correctness and auditability over minimum write latency.'],
                ['Outbox starvation will delay fulfillment and customer communication.'],
                ['Partition hot tables and monitor unpublished outbox lag as a first-class SLI.'],
              ),
            },
            {
              id: 'cart-cache',
              type: 'redis',
              label: 'cart_cache',
              x: 440,
              y: 695,
              parent: 'data',
              meta: 'TTL 15m + lock striping',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'read-your-writes',
                slo: { latencyP99Ms: 8, availability: 0.9999 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Key eviction burst', 'Cross-region inconsistency'],
              },
              architectureNotes: architect(
                'Redis stores ephemeral cart state and short-lived locks for high-throughput cart mutations.',
                ['Cache-aside', 'Soft TTL', 'Distributed locks'],
                ['Availability matters more than perfect cross-device read synchronization for active carts.'],
                ['Eviction storms can suddenly push all traffic back to the order database.'],
                ['Set explicit memory policies and warm high-volume carts after failover.'],
              ),
            },
            {
              id: 'events',
              type: 'kafka',
              label: 'commerce_events',
              x: 630,
              y: 695,
              parent: 'data',
              meta: 'Cart + order domain events',
              producing: SHOPIFY_KAFKA_PRODUCING,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EC',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 150, availability: 0.9995 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Consumer lag growth', 'Partition skew'],
              },
              architectureNotes: architect(
                'Kafka decouples synchronous checkout from downstream fulfillment, messaging, and analytics fan-out.',
                ['Event backbone', 'Ordered partitioning by aggregate ID'],
                ['Accepts eventual side-effect convergence to keep synchronous transaction scope small.'],
                ['Partition skew on hot merchants or campaigns can delay consumers while cluster health looks green.'],
                ['Partition by stable business key and alert on backlog age by topic and key range.'],
              ),
              notes:
                'Topics: cart.events (12 partitions, 7d retention), order.events (24 partitions, 30d), inventory.events (12 partitions, 14d). Partition key = aggregate_id. Min in-sync replicas = 2.',
            },
            {
              id: 'dlq-events',
              type: 'kafka',
              label: 'commerce_events_dlq',
              x: 630,
              y: 770,
              parent: 'data',
              meta: 'Poison events + replay',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 200, availability: 0.999 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['DLQ overflow during incident', 'Operator forgets to drain'],
              },
              architectureNotes: architect(
                'Dead-letter topic shared by fulfillment, search-indexer, and outbox-publisher. Retains failed events for inspection and replay so the live topic stays clean.',
                ['DLQ pattern', 'Manual replay tooling', 'Failure isolation'],
                ['Eventual: DLQ correctness matters more than latency; events stay until operator drains.'],
                ['DLQ growth without alerts means silent fan-out failures.'],
                ['Alert when DLQ depth > 1000 messages; replay tool requires explicit operator confirm.'],
              ),
              notes:
                'Retention 14d. Each message tagged with original topic, consumer group, error class, and attempt count. Replay tool dedupes by event_id before re-publishing.',
            },

            {
              id: 'stripe',
              type: 'stripe',
              label: 'Stripe',
              x: 765,
              y: 50,
              parent: 'external',
              meta: 'Card auth + capture',
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 450, availability: 0.999 },
                replicas: 1,
                redundancy: 'none',
              },
              architectureNotes: architect(
                'External payment dependency should be wrapped by idempotent intent handling and webhook reconciliation.',
                ['External service adapter', 'Circuit breaker'],
                ['Payment confirmation correctness dominates latency considerations.'],
                ['Provider tail latency and webhook ordering are outside direct control.'],
                ['Persist provider references and treat webhooks as eventually consistent confirmations.'],
              ),
            },
            {
              id: 'sendgrid',
              type: 'sendgrid',
              label: 'SendGrid',
              x: 765,
              y: 195,
              parent: 'external',
              meta: 'Order email',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 1200, availability: 0.995 },
                replicas: 1,
                redundancy: 'none',
              },
              architectureNotes: architect(
                'Email notifications are asynchronous and must never sit on the payment or shipment critical path.',
                ['Asynchronous notification', 'Retry with dead-letter queue'],
                ['Customer email can arrive later than order confirmation without harming transactional correctness.'],
                ['Provider throttling during campaigns can create large retry backlogs.'],
                ['Batch low-priority mail and preserve idempotency on message templates.'],
              ),
            },
            {
              id: 'twilio',
              type: 'twilio',
              label: 'Twilio SMS',
              x: 765,
              y: 340,
              parent: 'external',
              meta: 'Shipment alerts',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 1500, availability: 0.995 },
                replicas: 1,
                redundancy: 'none',
              },
              architectureNotes: architect(
                'SMS is reserved for high-value shipment updates where a brief delivery lag is tolerable.',
                ['Priority notification lanes'],
                ['Chooses availability over immediacy by retrying asynchronously across regional carriers.'],
                ['Carrier filtering and cost spikes can appear without API-level failure signals.'],
                ['Monitor delivery receipts and enforce spend guardrails per merchant or campaign.'],
              ),
            },
            {
              id: 'vector',
              type: 'vector',
              label: 'vector_store',
              x: 765,
              y: 485,
              parent: 'external',
              meta: '1536-d product embeddings',
              schema: SHOPIFY_VECTOR_SCHEMA,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 110, availability: 0.995 },
                replicas: 2,
                redundancy: 'active-active',
                failureModes: ['Embedding drift', 'Cold cache for ANN index'],
              },
              architectureNotes: architect(
                'Vector store holds recommendation features and is explicitly isolated from the transactional order path.',
                ['Vector retrieval', 'Offline embedding pipeline'],
                ['Freshness is secondary to low-latency retrieval because stale recommendations are acceptable for a short window.'],
                ['Delayed embedding refresh can bias recommendations after catalog promotions.'],
                ['Version embeddings and keep rollback-safe model metadata.'],
              ),
            },
            {
              id: 'metrics',
              type: 'prometheus',
              label: 'Prometheus',
              x: 765,
              y: 630,
              parent: 'external',
              meta: 'SLOs + backlog age',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 5000, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-passive',
              },
              architectureNotes: architect(
                'Observability emphasizes business-critical symptoms such as checkout error rate, outbox lag, and consumer backlog age.',
                ['Golden signals', 'USE + RED metrics', 'SLO burn-rate alerts'],
                ['Telemetry can be eventually consistent as long as incident detection remains timely.'],
                ['If only infrastructure metrics are tracked, payment or fulfillment regressions will hide in plain sight.'],
                ['Track domain SLIs per bounded context and link alerts to clear runbooks.'],
              ),
            },
          ],
          groups,
        ),
      ],
      edges: edgesFromSeeds([
        // Client → edge (critical user path)
        { id: 'shop-e1', from: 'web', to: 'cdn', protocol: 'rest', description: 'Static assets + SSR responses', latencyMsHint: 30, criticality: 'critical' },
        { id: 'shop-e2', from: 'ios', to: 'gw', protocol: 'rest', description: 'Mobile storefront API (LTE/5G round-trip)', latencyMsHint: 120, criticality: 'critical' },
        { id: 'shop-e3', from: 'android', to: 'gw', protocol: 'rest', description: 'Mobile storefront API', latencyMsHint: 120, criticality: 'critical' },
        { id: 'shop-e4', from: 'cdn', to: 'gw', protocol: 'rest', description: 'Edge cache miss → origin', latencyMsHint: 25, criticality: 'critical' },

        // Gateway fan-out (intra-cluster sync)
        { id: 'shop-e5', from: 'gw', to: 'auth', protocol: 'rest', description: 'JWT verify + profile hydrate', latencyMsHint: 15, criticality: 'critical' },
        { id: 'shop-e6', from: 'gw', to: 'catalog', protocol: 'rest', description: 'Catalog browse + PDP compose', latencyMsHint: 25, criticality: 'critical' },
        { id: 'shop-e7', from: 'gw', to: 'cart', protocol: 'graphql', description: 'Cart query + mutation fan-in', latencyMsHint: 35, criticality: 'critical' },
        { id: 'shop-e8', from: 'gw', to: 'checkout', protocol: 'rest', description: 'Quote + order placement', latencyMsHint: 25, criticality: 'critical' },
        { id: 'shop-e21', from: 'gw', to: 'reco', protocol: 'rest', description: 'Advisory recommendation widget (failable open)', latencyMsHint: 80, criticality: 'background' },

        // Catalog domain
        { id: 'shop-e9', from: 'catalog', to: 'catalog-db', protocol: 'sql', description: 'Catalog OLTP — writes', latencyMsHint: 8, criticality: 'critical' },
        { id: 'shop-e24', from: 'catalog', to: 'catalog-db-replica', protocol: 'sql', description: 'Browse reads — async replica', latencyMsHint: 10, criticality: 'normal' },
        { id: 'shop-e11', from: 'catalog', to: 'events', protocol: 'kafka', async: true, description: 'ProductUpdated + InventoryReserved (outbox)', latencyMsHint: 12, criticality: 'background' },

        // Cart domain
        { id: 'shop-e12', from: 'cart', to: 'cart-cache', protocol: 'redis', description: 'High-frequency cart state', latencyMsHint: 2, criticality: 'normal' },
        { id: 'shop-e13', from: 'cart', to: 'events', protocol: 'kafka', async: true, description: 'CartUpdated stream', latencyMsHint: 12, criticality: 'background' },

        // Checkout flow
        { id: 'shop-e14', from: 'checkout', to: 'order-db', protocol: 'sql', description: 'Transactional order ledger + outbox row', latencyMsHint: 10, criticality: 'critical' },
        { id: 'shop-e33', from: 'checkout', to: 'saga-orchestrator', protocol: 'grpc', description: 'Begin saga: reserve → charge → ship', latencyMsHint: 15, criticality: 'critical' },
        { id: 'shop-e15', from: 'checkout', to: 'stripe', protocol: 'rest', description: 'PaymentIntent.create (idempotency-key)', latencyMsHint: 100, criticality: 'critical' },

        // Saga orchestration
        { id: 'shop-e34', from: 'saga-orchestrator', to: 'catalog', protocol: 'rest', description: 'ReserveInventory step', latencyMsHint: 30, criticality: 'critical' },
        { id: 'shop-e35', from: 'saga-orchestrator', to: 'stripe', protocol: 'rest', description: 'PaymentIntent.confirm step', latencyMsHint: 250, criticality: 'critical' },
        { id: 'shop-e36', from: 'saga-orchestrator', to: 'events', protocol: 'kafka', async: true, description: 'Saga step events (started/completed/compensated)', latencyMsHint: 12, criticality: 'background' },

        // Outbox publisher (transactional outbox pattern)
        { id: 'shop-e28', from: 'outbox-publisher', to: 'order-db', protocol: 'sql', description: 'Poll outbox_events (advisory_lock leader)', latencyMsHint: 8, criticality: 'normal' },
        { id: 'shop-e29', from: 'outbox-publisher', to: 'events', protocol: 'kafka', async: true, description: 'Publish OrderPlaced + InventoryReserved', latencyMsHint: 12, criticality: 'background' },
        { id: 'shop-e32', from: 'outbox-publisher', to: 'dlq-events', protocol: 'kafka', async: true, description: 'Failed publishes after retry budget', latencyMsHint: 15, criticality: 'background' },

        // Stripe webhook (provider → us)
        { id: 'shop-e37', from: 'stripe', to: 'stripe-webhook', protocol: 'rest', description: 'Stripe → webhook receiver (HMAC verified)', latencyMsHint: 80, criticality: 'critical' },
        { id: 'shop-e38', from: 'stripe-webhook', to: 'events', protocol: 'kafka', async: true, description: 'Enqueue verified webhook for async processing', latencyMsHint: 12, criticality: 'background' },

        // Search read model (CQRS projection)
        { id: 'shop-e25', from: 'events', to: 'search-indexer', protocol: 'kafka', async: true, description: 'Catalog domain events to indexer', latencyMsHint: 15, criticality: 'background' },
        { id: 'shop-e26', from: 'search-indexer', to: 'search', protocol: 'rest', description: 'Index upsert (idempotent by document_version)', latencyMsHint: 30, criticality: 'normal' },
        { id: 'shop-e27', from: 'search-indexer', to: 'catalog-db-replica', protocol: 'sql', description: '24h full crawl safety net', latencyMsHint: 10, criticality: 'background' },
        { id: 'shop-e31', from: 'search-indexer', to: 'dlq-events', protocol: 'kafka', async: true, description: 'Poison projection events', latencyMsHint: 15, criticality: 'background' },

        // Fulfillment async fan-out
        { id: 'shop-e16', from: 'checkout', to: 'events', protocol: 'kafka', async: true, description: 'OrderPlaced outbox publish (sync direct path — legacy)', latencyMsHint: 12, criticality: 'background' },
        { id: 'shop-e17', from: 'events', to: 'fulfillment', protocol: 'kafka', async: true, description: 'Shipment side effects', latencyMsHint: 15, criticality: 'background' },
        { id: 'shop-e30', from: 'fulfillment', to: 'dlq-events', protocol: 'kafka', async: true, description: 'Carrier-API failures after retry budget', latencyMsHint: 15, criticality: 'background' },
        { id: 'shop-e18', from: 'fulfillment', to: 'sendgrid', protocol: 'rest', async: true, description: 'Order + shipment email', latencyMsHint: 600, criticality: 'background' },
        { id: 'shop-e19', from: 'fulfillment', to: 'twilio', protocol: 'rest', async: true, description: 'Priority shipment SMS', latencyMsHint: 700, criticality: 'background' },

        // Recommendations (advisory)
        { id: 'shop-e20', from: 'reco', to: 'vector', protocol: 'sql', description: 'Embedding retrieval + feedback writes', latencyMsHint: 12, criticality: 'normal' },

        // Observability (background telemetry)
        { id: 'shop-e22', from: 'checkout', to: 'metrics', protocol: 'rest', async: true, description: 'Order + payment SLIs', latencyMsHint: 10, criticality: 'background' },
        { id: 'shop-e23', from: 'events', to: 'metrics', protocol: 'rest', async: true, description: 'Backlog + consumer lag export', latencyMsHint: 10, criticality: 'background' },
      ]),
    };
  },
};

/* -------------------------------------------------------------------------- */
/*                         Meeting Platform Reference                         */
/* -------------------------------------------------------------------------- */

const MEETING_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'varchar(255)', nullable: false, primaryKey: false, unique: true },
        { name: 'full_name', type: 'varchar(160)', nullable: false, primaryKey: false },
        { name: 'avatar_url', type: 'text', nullable: true, primaryKey: false },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [{ name: 'meeting_users_email_idx', columns: ['email'], unique: true }],
    },
    {
      name: 'workspaces',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'name', type: 'varchar(120)', nullable: false, primaryKey: false },
        { name: 'plan', type: 'varchar(32)', nullable: false, primaryKey: false, default: "'free'" },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [],
    },
    {
      name: 'meetings',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'workspace_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'workspaces', column: 'id' } },
        { name: 'host_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'users', column: 'id' } },
        { name: 'title', type: 'varchar(200)', nullable: false, primaryKey: false },
        { name: 'room_code', type: 'varchar(16)', nullable: false, primaryKey: false, unique: true },
        { name: 'status', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'scheduled'" },
        { name: 'scheduled_at', type: 'timestamp', nullable: true, primaryKey: false },
        { name: 'started_at', type: 'timestamp', nullable: true, primaryKey: false },
        { name: 'ended_at', type: 'timestamp', nullable: true, primaryKey: false },
        { name: 'recording_enabled', type: 'boolean', nullable: false, primaryKey: false, default: 'false' },
      ],
      indexes: [
        { name: 'meetings_workspace_status_idx', columns: ['workspace_id', 'status'], unique: false },
        { name: 'meetings_room_code_idx', columns: ['room_code'], unique: true },
      ],
    },
    {
      name: 'participants',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'meeting_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'meetings', column: 'id' } },
        { name: 'user_id', type: 'uuid', nullable: true, primaryKey: false, foreignKey: { table: 'users', column: 'id' } },
        { name: 'guest_name', type: 'varchar(120)', nullable: true, primaryKey: false },
        { name: 'role', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'attendee'" },
        { name: 'joined_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
        { name: 'left_at', type: 'timestamp', nullable: true, primaryKey: false },
      ],
      indexes: [{ name: 'participants_meeting_joined_idx', columns: ['meeting_id', 'joined_at'], unique: false }],
    },
    {
      name: 'recordings',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'meeting_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'meetings', column: 'id' } },
        { name: 'storage_key', type: 'text', nullable: false, primaryKey: false },
        { name: 'status', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'queued'" },
        { name: 'duration_sec', type: 'integer', nullable: true, primaryKey: false },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [{ name: 'recordings_meeting_idx', columns: ['meeting_id'], unique: false }],
    },
    {
      name: 'invitations',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'meeting_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'meetings', column: 'id' } },
        { name: 'email', type: 'varchar(255)', nullable: false, primaryKey: false },
        { name: 'token', type: 'varchar(64)', nullable: false, primaryKey: false, unique: true },
        { name: 'status', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'pending'" },
        { name: 'sent_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [{ name: 'meeting_invite_token_idx', columns: ['token'], unique: true }],
    },
    {
      name: 'subscriptions',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'workspace_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'workspaces', column: 'id' } },
        { name: 'plan', type: 'varchar(32)', nullable: false, primaryKey: false },
        { name: 'stripe_customer_id', type: 'varchar(64)', nullable: true, primaryKey: false },
        { name: 'renewal_at', type: 'timestamp', nullable: true, primaryKey: false },
      ],
      indexes: [{ name: 'meeting_subscriptions_workspace_idx', columns: ['workspace_id'], unique: false }],
    },
    {
      name: 'outbox_events',
      columns: [
        { name: 'id', type: 'bigserial', nullable: false, primaryKey: true },
        { name: 'aggregate_type', type: 'varchar(32)', nullable: false, primaryKey: false },
        { name: 'aggregate_id', type: 'uuid', nullable: false, primaryKey: false },
        { name: 'event_name', type: 'varchar(64)', nullable: false, primaryKey: false },
        { name: 'payload', type: 'jsonb', nullable: false, primaryKey: false },
        { name: 'published_at', type: 'timestamp', nullable: true, primaryKey: false },
      ],
      indexes: [{ name: 'meeting_outbox_published_idx', columns: ['published_at'], unique: false }],
    },
  ],
};

const MEETING_GATEWAY_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://api.meet.example.com',
      endpoints: [
        {
          method: 'GET',
          path: '/bootstrap',
          description: 'Returns feature flags, region routing, and active workspace context.',
          response: [
            field('user', 'CurrentUser', 'Authenticated principal', true),
            field('region', 'string'),
            field('featureFlags', 'string[]'),
          ],
          statusCodes: ['200'],
        },
        {
          method: 'POST',
          path: '/meetings/:meetingId/session',
          description: 'Issues short-lived join session for the websocket and media plane.',
          request: [field('device', 'string'), field('role', 'string')],
          response: [
            field('sessionToken', 'jwt'),
            field('signalingUrl', 'string'),
            field('expiresInSec', 'integer'),
          ],
          statusCodes: ['200', '403', '404'],
        },
      ],
    },
  ],
};

const MEETING_AUTH_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://identity.meet.example.com',
      endpoints: [
        {
          method: 'POST',
          path: '/login',
          request: [field('email', 'string'), field('password', 'string')],
          response: [field('accessToken', 'jwt'), field('refreshToken', 'jwt'), field('workspaceIds', 'uuid[]')],
          statusCodes: ['200', '401'],
        },
        {
          method: 'POST',
          path: '/refresh',
          request: [field('refreshToken', 'jwt')],
          response: [field('accessToken', 'jwt'), field('expiresInSec', 'integer')],
          statusCodes: ['200', '401'],
        },
        {
          method: 'GET',
          path: '/me',
          response: [field('userId', 'uuid'), field('email', 'string'), field('workspaceRoles', 'WorkspaceRole[]')],
          statusCodes: ['200', '401'],
        },
      ],
    },
  ],
};

const MEETING_SERVICE_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://meeting.meet.svc.cluster.local',
      endpoints: [
        {
          method: 'POST',
          path: '/meetings',
          description: 'Creates an instant or scheduled meeting.',
          request: [
            field('workspaceId', 'uuid'),
            field('title', 'string'),
            field('scheduledAt', 'timestamp', 'Required for scheduled sessions', true),
            field('recordingEnabled', 'boolean'),
          ],
          response: [
            field('meetingId', 'uuid'),
            field('roomCode', 'string'),
            field('status', 'string'),
          ],
          statusCodes: ['201', '409'],
        },
        {
          method: 'GET',
          path: '/meetings/:meetingId',
          response: [
            field('meeting', 'MeetingDetail'),
            field('participants', 'ParticipantSummary[]'),
          ],
          statusCodes: ['200', '404'],
        },
        {
          method: 'POST',
          path: '/meetings/:meetingId/invitations',
          request: [
            field('emails', 'string[]'),
            field('message', 'string', 'Optional invite note', true),
          ],
          response: [field('created', 'integer'), field('invalidEmails', 'string[]')],
          statusCodes: ['202', '404'],
        },
        {
          method: 'POST',
          path: '/billing/checkout',
          request: [field('workspaceId', 'uuid'), field('plan', 'string')],
          response: [field('checkoutUrl', 'string')],
          statusCodes: ['200', '409'],
        },
      ],
    },
  ],
};

const SIGNALING_API: ApiSpec = {
  protocols: [
    {
      kind: 'websocket',
      baseUrl: 'wss://realtime.meet.example.com/signaling',
      endpoints: [
        {
          events: ['signal.offer', 'signal.answer', 'signal.candidate'],
          description: 'WebRTC peer negotiation events.',
          request: [
            field('meetingId', 'uuid'),
            field('participantId', 'uuid'),
            field('payload', 'RtcSignalPayload'),
          ],
          response: [field('ack', 'boolean')],
        },
        {
          events: ['participant.joined', 'participant.left', 'participant.muted'],
          description: 'Presence and moderation broadcast.',
          response: [field('participant', 'ParticipantPresence')],
        },
        {
          events: ['chat.message'],
          description: 'In-meeting ephemeral chat event.',
          request: [field('meetingId', 'uuid'), field('body', 'string')],
          response: [field('messageId', 'uuid'), field('sentAt', 'timestamp')],
        },
      ],
    },
  ],
};

const MEETING_EVENTS: ProducingSpec = {
  events: [
    {
      name: 'MeetingStarted',
      publishers: ['meeting-service'],
      fields: [
        field('meetingId', 'uuid'),
        field('workspaceId', 'uuid'),
        field('hostId', 'uuid'),
      ],
      description: 'Starts reminder suppression and recording workflows.',
    },
    {
      name: 'RecordingRequested',
      publishers: ['meeting-service'],
      fields: [
        field('meetingId', 'uuid'),
        field('workspaceId', 'uuid'),
        field('recordingId', 'uuid'),
      ],
      description: 'Fan-out to recording pipeline.',
    },
    {
      name: 'InvitationRequested',
      publishers: ['meeting-service'],
      fields: [
        field('meetingId', 'uuid'),
        field('emails', 'string[]'),
        field('workspaceId', 'uuid'),
      ],
    },
  ],
};

const RECORDING_CONSUMER: ConsumingSpec = {
  sourceNodeId: 'meeting-events',
  handler: 'prepare_recording_upload_and_finalize_manifest',
  concurrency: 4,
  deadLetterNodeId: 'notification-dlq',
  notes:
    'Idempotent by recordingId; resumable per-segment via recording_manifests.status. Failed jobs DLQ to notification-dlq with original payload + error class.',
};

const NOTIFICATION_CONSUMER: ConsumingSpec = {
  sourceNodeId: 'meeting-events',
  handler: 'fanout_invites_and_reminders',
  concurrency: 6,
  deadLetterNodeId: 'notification-dlq',
  notes:
    'Dedup key (invitation_token, channel) stored in meeting-cache (TTL 7d). Email/SMS retries exponential 3 attempts, then DLQ. Per-user TZ resolved at fan-out time from users.tz column.',
};

const REMINDER_JOB: ScheduledSpec = {
  schedule: '*/10 * * * *',
  handler: 'dispatch_upcoming_meeting_reminders',
  description: 'Looks ahead 30 minutes and emits reminder events for meetings that have not started yet.',
  timezone: 'UTC',
};

const MEETING_SFU_API: ApiSpec = {
  protocols: [
    {
      kind: 'websocket',
      baseUrl: 'wss://sfu.meet.example.com',
      endpoints: [
        {
          events: ['sfu.publish', 'sfu.subscribe', 'sfu.simulcast.layer', 'sfu.bandwidth.target'],
          description:
            'WebRTC SFU media plane. Receives publisher RTP, fans out subscriber tracks with simulcast. Sticky by meeting_id consistent-hash so all participants land on the same SFU pod.',
          request: [
            field('meetingId', 'uuid'),
            field('participantId', 'uuid'),
            field('mediaCapabilities', 'RtpCapabilities'),
          ],
          response: [
            field('routerId', 'string', 'Mediasoup-style router id'),
            field('producerId', 'string'),
            field('iceServers', 'IceServer[]'),
          ],
        },
      ],
    },
  ],
};

const MEETING_MANIFEST_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'recording_manifests',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'meeting_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'meetings', column: 'id' } },
        { name: 'storage_prefix', type: 'text', nullable: false, primaryKey: false },
        { name: 'segment_count', type: 'integer', nullable: false, primaryKey: false, default: '0' },
        { name: 'duration_sec', type: 'integer', nullable: true, primaryKey: false },
        { name: 'status', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'in_progress'" },
        { name: 'finalized_at', type: 'timestamp', nullable: true, primaryKey: false },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [
        { name: 'manifest_meeting_idx', columns: ['meeting_id'], unique: false },
        { name: 'manifest_status_idx', columns: ['status', 'created_at'], unique: false },
      ],
    },
    {
      name: 'recording_segments',
      columns: [
        { name: 'manifest_id', type: 'uuid', nullable: false, primaryKey: true, foreignKey: { table: 'recording_manifests', column: 'id' } },
        { name: 'segment_index', type: 'integer', nullable: false, primaryKey: true },
        { name: 'storage_key', type: 'text', nullable: false, primaryKey: false },
        { name: 'bytes', type: 'bigint', nullable: false, primaryKey: false },
        { name: 'recorded_at', type: 'timestamp', nullable: false, primaryKey: false },
      ],
      indexes: [],
    },
  ],
};

const MEETING_MONOLITH: TemplateSpec = {
  id: 'meeting-monolith',
  name: 'Meeting Platform',
  description: 'Reference meeting architecture with explicit realtime, recording, and notification boundaries',
  build: () => {
    const groups: SeedGroup[] = [
      { id: 'meeting-clients', label: 'Clients', x: 30, y: 10, width: 670, height: 120, tone: 'client' },
      { id: 'meeting-edge', label: 'Edge and Realtime Entry', x: 30, y: 150, width: 670, height: 110, tone: 'edge' },
      { id: 'meeting-domain', label: 'Domain Services', x: 30, y: 280, width: 670, height: 320, tone: 'service' },
      { id: 'meeting-data', label: 'Data and Async Backbone', x: 30, y: 620, width: 670, height: 240, tone: 'data' },
      { id: 'meeting-external', label: 'External and Ops', x: 730, y: 10, width: 260, height: 850, tone: 'external' },
    ];

    return {
      nodes: [
        ...groupsFromSeeds(groups),
        ...nodesFromSeeds(
          [
            {
              id: 'meeting-web',
              type: 'web',
              label: 'Web Client',
              x: 60,
              y: 40,
              parent: 'meeting-clients',
              meta: 'Lobby + in-call UI',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 250, availability: 0.999 },
                replicas: 4,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Web client is optimized for fast join flows and receives configuration plus region routing from the API gateway.',
                ['Bootstrap endpoint', 'Progressive enhancement'],
                ['Short windows of stale roster state are acceptable if media joins remain available.'],
                ['Large all-in-one payloads can slow join UX before media even starts.'],
                ['Keep bootstrap payload small and lazy-load recordings or billing surfaces.'],
              ),
            },
            {
              id: 'meeting-ios',
              type: 'ios',
              label: 'iOS App',
              x: 275,
              y: 40,
              parent: 'meeting-clients',
              meta: 'Push + background audio',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 280, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Mobile join flow should tolerate flaky networks by separating identity refresh from websocket/session establishment.',
                ['Token refresh middleware', 'Local media state cache'],
                ['Prioritizes availability and reconnection speed over perfectly fresh participant metadata.'],
                ['Aggressive reconnect loops can saturate signaling during regional incidents.'],
                ['Backoff reconnects and reuse short-lived session tokens instead of full re-auth when possible.'],
              ),
            },
            {
              id: 'meeting-android',
              type: 'android',
              label: 'Android App',
              x: 490,
              y: 40,
              parent: 'meeting-clients',
              meta: 'Adaptive bitrate aware',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 280, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Android follows the same API contracts as iOS and should avoid bespoke call orchestration logic.',
                ['Shared DTO contract', 'Network-aware retry policy'],
                ['Presence data can be stale briefly as long as session establishment stays fast.'],
                ['Divergent mobile contract evolution will create hard-to-debug edge cases in call setup.'],
                ['Keep mobile contract testing pinned to the shared gateway schema.'],
              ),
            },

            {
              id: 'meeting-cdn',
              type: 'cdn',
              label: 'CDN',
              x: 60,
              y: 185,
              parent: 'meeting-edge',
              meta: 'Static assets + WAF',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 60, availability: 0.9999 },
                replicas: 20,
                redundancy: 'multi-region',
              },
              architectureNotes: architect(
                'Protects the control plane from static asset load and basic abuse before requests reach the gateway.',
                ['Edge caching', 'WAF'],
                ['Optimizes for availability and latency over instant purge visibility.'],
                ['Join-page asset drift can cause partial UI mismatch during staggered deploys.'],
                ['Deploy immutable assets and version bootstrap config.'],
              ),
            },
            {
              id: 'meeting-gw',
              type: 'gateway',
              label: 'API Gateway',
              x: 285,
              y: 185,
              parent: 'meeting-edge',
              meta: 'Bootstrap + session issuance',
              api: MEETING_GATEWAY_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EL',
                consistencyModel: 'read-your-writes',
                slo: { latencyP99Ms: 150, availability: 0.9995, rpsTarget: 5000 },
                replicas: 5,
                redundancy: 'active-active',
                failureModes: ['Cross-service tail latency', 'Session token issuer unavailability'],
              },
              architectureNotes: architect(
                'Gateway keeps clients thin by composing identity, meeting metadata, and region-aware signaling session issuance.',
                ['Backend-for-frontend', 'Session token minting', 'Timeout budgets'],
                ['Strict consistency is required for session issuance while noncritical metadata may be slightly stale.'],
                ['If gateway orchestration grows unchecked it becomes a hidden monolith.'],
                ['Keep orchestration shallow and push domain rules back to owning services.'],
              ),
            },
            {
              id: 'signaling',
              type: 'websocket',
              label: 'Signaling Gateway',
              x: 515,
              y: 185,
              parent: 'meeting-edge',
              meta: 'WebRTC signaling + roster',
              api: SIGNALING_API,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 70, availability: 0.9999, rpsTarget: 12000 },
                replicas: 8,
                redundancy: 'active-active',
                failureModes: ['Connection storms on region failover', 'Hot meeting partition skew'],
              },
              architectureNotes: architect(
                'Realtime signaling is isolated from CRUD APIs so bursty participant churn does not destabilize the meeting control plane.',
                ['Dedicated realtime gateway', 'Connection sharding'],
                ['Availability and low latency outweigh perfect roster consistency for transient presence events.'],
                ['Hot all-hands meetings can skew shard load and cause uneven websocket eviction.'],
                ['Shard by meeting ID and expose connection count plus reconnect rate as first-class signals.'],
              ),
            },

            {
              id: 'identity',
              type: 'auth',
              label: 'Identity Service',
              x: 60,
              y: 325,
              parent: 'meeting-domain',
              meta: 'JWT + workspace roles',
              api: MEETING_AUTH_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 140, availability: 0.9995 },
                replicas: 4,
                redundancy: 'active-active',
                failureModes: ['Key rotation mismatch', 'Refresh token replay'],
              },
              architectureNotes: architect(
                'Identity owns login, token refresh, and workspace role hydration independently from meeting state.',
                ['Central auth service', 'Short-lived access tokens'],
                ['Revocation correctness matters more than absolute login latency.'],
                ['A bad key rollout can invalidate every active meeting session.'],
                ['Automate staged signing-key rotation and keep introspection fallbacks.'],
              ),
            },
            {
              id: 'meeting-service',
              type: 'service',
              label: 'Meeting Service',
              x: 275,
              y: 325,
              parent: 'meeting-domain',
              meta: 'CRUD + invites + billing hooks',
              api: MEETING_SERVICE_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 200, availability: 0.9995 },
                replicas: 5,
                redundancy: 'active-active',
                failureModes: ['Order-of-events mismatch between control plane and realtime plane', 'DB hot rows on participant spikes'],
              },
              architectureNotes: architect(
                'Owns durable meeting lifecycle, invitations, subscription hooks, and recording requests while keeping websocket state ephemeral.',
                ['Database per service', 'Transactional outbox', 'Command-query separation'],
                ['Prefers strong consistency for scheduling, invitations, and billing because duplicated side effects are expensive.'],
                ['If in-call chat or presence writes land here synchronously, the control plane will become a bottleneck.'],
                ['Keep ephemeral session state out of the primary OLTP database and project side effects through the outbox.'],
              ),
            },
            {
              id: 'recording-worker',
              type: 'kafka-consumer',
              label: 'Recording Worker',
              x: 490,
              y: 325,
              parent: 'meeting-domain',
              meta: 'Manifest + upload pipeline',
              consuming: RECORDING_CONSUMER,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EC',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 5000, availability: 0.999 },
                replicas: 4,
                redundancy: 'active-active',
                failureModes: ['Large recording upload retries', 'Partial manifest finalization'],
              },
              architectureNotes: architect(
                'Recording work is asynchronous and durable so long-running media processing never blocks the host ending a meeting.',
                ['Async worker', 'Resumable jobs', 'Idempotent consumers'],
                ['Eventual completion is acceptable because recordings are not required at call teardown time.'],
                ['Large uploads can retry for long periods and amplify storage cost if jobs are not resumable.'],
                ['Persist resumable checkpoints and surface upload age as an operational SLI.'],
              ),
            },
            {
              id: 'notifier',
              type: 'consumer',
              label: 'Notification Worker',
              x: 490,
              y: 455,
              parent: 'meeting-domain',
              meta: 'Invite + reminder fan-out',
              consuming: NOTIFICATION_CONSUMER,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 2500, availability: 0.999 },
                replicas: 6,
                redundancy: 'active-active',
                failureModes: ['Provider throttling', 'Invite fan-out duplicates'],
              },
              architectureNotes: architect(
                'Notifications sit behind an event consumer so email and SMS latency never stretches user-facing scheduling APIs.',
                ['Fan-out worker', 'Retry queue', 'Template-driven notifications'],
                ['Delivery can be eventually consistent as long as reminders arrive before scheduled start time.'],
                ['Duplicate fan-out will spam attendees if idempotency is not enforced per invitation and channel.'],
                ['Key message dedupe on invitation token and channel.'],
              ),
            },
            {
              id: 'reminder-job',
              type: 'cron',
              label: 'Reminder Scheduler',
              x: 275,
              y: 455,
              parent: 'meeting-domain',
              meta: '10m cadence',
              scheduled: REMINDER_JOB,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 10000, availability: 0.995 },
                replicas: 2,
                redundancy: 'active-passive',
                failureModes: ['Clock skew', 'Overlapping execution windows'],
              },
              architectureNotes: architect(
                'Scheduled job emits reminder intents independently from the meeting service to keep join-critical APIs clean.',
                ['Scheduler + event emission', 'Watermark processing'],
                ['Correctness of reminder windows matters more than very low execution latency.'],
                ['Clock skew or overlapping runs can double-send reminders.'],
                ['Store watermarks and lock by window before enqueuing reminders.'],
              ),
              notes:
                'Per-user TZ resolved at fan-out time from `users.tz`. Cron tetikler (UTC), filtre içerikte. Watermark: meetings.last_reminder_window_id; advisory_lock by window_id.',
            },
            {
              id: 'media-sfu',
              type: 'service',
              label: 'Media SFU',
              x: 60,
              y: 540,
              parent: 'meeting-domain',
              meta: 'WebRTC selective forwarding · sticky by meetingId',
              api: MEETING_SFU_API,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 50, availability: 0.9999, rpsTarget: 8000 },
                replicas: 12,
                redundancy: 'multi-region',
                failureModes: ['Pod-local participant migration', 'NAT traversal failure (TURN fallback)', 'Bandwidth saturation on hot all-hands'],
              },
              architectureNotes: architect(
                'Selective Forwarding Unit handles the audio/video data plane. Signaling stays on the WebSocket gateway; this node only carries RTP/SRTP. Sticky routing by meeting_id keeps all participants on one pod for low fan-out latency.',
                ['SFU (mediasoup/livekit-style)', 'Sticky routing by consistent-hash(meetingId)', 'Simulcast + adaptive bitrate'],
                ['AP/eventual: media is best-effort RTP; loss tolerated, no retransmit beyond NACK/PLI windows.'],
                ['Pod loss disconnects all participants on that meeting; cross-pod rebalance is expensive.'],
                ['Track per-pod participant count and trigger drain at 80% capacity. TURN fallback for ~5% of clients behind symmetric NAT.'],
              ),
              notes:
                'Capacity: ~500 publishers per pod; fan-out factor depends on simulcast layers. Bandwidth budget: 1.5 Mbps/publisher × N subscribers. STUN servers + TURN relay (TLS over 443) for NAT traversal.',
            },

            {
              id: 'meeting-db',
              type: 'postgres',
              label: 'meeting_db',
              x: 60,
              y: 715,
              parent: 'meeting-data',
              meta: 'Lifecycle + billing ledger',
              schema: MEETING_SCHEMA,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 35, availability: 0.9995 },
                replicas: 3,
                redundancy: 'active-passive',
                failureModes: ['Primary failover lag', 'Large roster scans'],
              },
              architectureNotes: architect(
                'Durable meeting state, invitations, subscriptions, and outbox events live here; ephemeral media state does not.',
                ['Transactional outbox', 'Read replicas'],
                ['Strong consistency protects scheduling and billing invariants.'],
                ['Storing hot presence or media stats here would quickly create write amplification.'],
                ['Project presence elsewhere and keep OLTP focused on durable state transitions.'],
              ),
            },
            {
              id: 'meeting-cache',
              type: 'redis',
              label: 'presence_cache',
              x: 250,
              y: 715,
              parent: 'meeting-data',
              meta: 'Session + roster cache',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'read-your-writes',
                slo: { latencyP99Ms: 8, availability: 0.9999 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Roster drift after failover', 'Memory pressure during all-hands'],
              },
              architectureNotes: architect(
                'Redis holds join sessions, ephemeral participant presence, and lightweight rate-limiting counters.',
                ['Cache-aside', 'Ephemeral state store'],
                ['Availability and low latency matter more than durable exactness for transient roster state.'],
                ['If TTLs are too long, disconnected participants will linger in rosters.'],
                ['Tune TTLs per signal type and repopulate from websocket reconnects.'],
              ),
            },
            {
              id: 'meeting-events',
              type: 'kafka',
              label: 'meeting_events',
              x: 440,
              y: 715,
              parent: 'meeting-data',
              meta: 'Invites + recording events',
              producing: MEETING_EVENTS,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EC',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 150, availability: 0.9995 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Consumer lag', 'Hot meeting partition skew'],
              },
              architectureNotes: architect(
                'Kafka decouples meeting commands from slower notification and recording side effects.',
                ['Event backbone', 'Ordered partitions by meeting ID'],
                ['Eventual fan-out is acceptable because invite and recording workflows need durability more than synchronous completion.'],
                ['Backlog growth can silently delay reminders or recording availability while APIs look healthy.'],
                ['Alert on backlog age and consumer group freshness, not only broker health.'],
              ),
            },
            {
              id: 'recordings',
              type: 's3',
              label: 'recordings_bucket',
              x: 630,
              y: 715,
              parent: 'meeting-data',
              meta: 'Segment + manifest storage',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 250, availability: 0.9999 },
                replicas: 2,
                redundancy: 'multi-region',
                failureModes: ['Multipart upload abandonment', 'Manifest version skew'],
              },
              architectureNotes: architect(
                'Object storage keeps large media blobs out of the transactional control plane and supports resumable upload semantics.',
                ['Blob store', 'Manifest pattern', 'Presigned URLs'],
                ['Availability and throughput matter more than immediate manifest consistency.'],
                ['If manifest writes race with uploads, clients may observe incomplete recordings.'],
                ['Version manifests and publish them only after all required segments are committed.'],
              ),
              notes:
                'Storage class lifecycle: Standard 7d → IA 30d → Glacier 365d. Multipart uploads aborted after 24h via lifecycle rule. Presigned download TTL 15min.',
            },
            {
              id: 'recording-manifest-db',
              type: 'postgres',
              label: 'recording_manifests_db',
              x: 60,
              y: 790,
              parent: 'meeting-data',
              meta: 'Segment manifest + status',
              schema: MEETING_MANIFEST_SCHEMA,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 30, availability: 0.9995 },
                replicas: 3,
                redundancy: 'active-passive',
                failureModes: ['Manifest write race vs S3 finalize', 'Long-running orphan-segment GC'],
              },
              architectureNotes: architect(
                'Manifest store separated from `recordings` (S3) so finalization is transactional. Manifest published only when all segments are committed in S3 and recorded here.',
                ['Manifest pattern (decoupled bytes vs metadata)', 'Two-phase finalization', 'Soft-delete + GC'],
                ['CP for manifest correctness; users must not see partial recordings.'],
                ['If S3 commits but manifest write fails, recording-worker retries idempotently via segment_index unique key.'],
                ['Reconcile job: scan S3 prefix vs manifest segment_count daily; quarantine drift > 5 segments.'],
              ),
              notes:
                'Failure semantics: write-S3-then-write-manifest. Retry budget 3× then DLQ. Orphan segment GC: weekly cron scans manifests with status=in_progress and age > 24h.',
            },
            {
              id: 'notification-dlq',
              type: 'kafka',
              label: 'meeting_dlq',
              x: 250,
              y: 790,
              parent: 'meeting-data',
              meta: 'Failed notifications + recordings',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 200, availability: 0.999 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['DLQ overflow during provider outage', 'Operator drains without idempotency check'],
              },
              architectureNotes: architect(
                'Shared dead-letter topic for recording-worker and notifier consumers. Retains failed envelopes for inspection + manual replay so live topics stay clean.',
                ['DLQ pattern', 'Failure isolation', 'Manual replay tooling'],
                ['Eventual: DLQ stays correct over time; latency is not a goal here.'],
                ['Without alerts, silent provider outages can pile DLQ for hours.'],
                ['Alert at depth > 500 messages or oldest-message age > 1h. Replay tool requires explicit confirm + idempotency check.'],
              ),
              notes:
                'Retention 14d. Each message tagged with original_topic, consumer_group, error_class, attempt_count. Replay dedupes by (invitation_token, channel) for notifier and by recording_id for recording-worker.',
            },

            {
              id: 'meeting-stripe',
              type: 'stripe',
              label: 'Stripe',
              x: 765,
              y: 60,
              parent: 'meeting-external',
              meta: 'Workspace subscriptions',
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 500, availability: 0.999 },
                replicas: 1,
                redundancy: 'none',
              },
              architectureNotes: architect(
                'External billing system is isolated behind meeting service commands and webhook reconciliation.',
                ['External payment adapter', 'Webhook reconciliation'],
                ['Billing correctness matters more than low latency.'],
                ['Webhook delays can temporarily desync workspace entitlements.'],
                ['Keep entitlement writes idempotent and reconcile missed webhooks periodically.'],
              ),
            },
            {
              id: 'meeting-email',
              type: 'sendgrid',
              label: 'SendGrid',
              x: 765,
              y: 220,
              parent: 'meeting-external',
              meta: 'Invite email',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 1500, availability: 0.995 },
                replicas: 1,
                redundancy: 'none',
              },
              architectureNotes: architect(
                'Email delivery is asynchronous and templated by the notification worker.',
                ['Async notification', 'Retry with DLQ'],
                ['Invitation delivery can be eventually consistent as long as reminders remain timely.'],
                ['Provider throttling can delay large webinar invite waves.'],
                ['Stagger bulk sends and preserve per-recipient delivery state.'],
              ),
            },
            {
              id: 'meeting-sms',
              type: 'twilio',
              label: 'Twilio SMS',
              x: 765,
              y: 380,
              parent: 'meeting-external',
              meta: 'Reminder SMS',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 1800, availability: 0.995 },
                replicas: 1,
                redundancy: 'none',
              },
              architectureNotes: architect(
                'SMS is used selectively for meeting reminders and high-priority invites where email open rate is not enough.',
                ['Priority notification lane'],
                ['Accepts eventual consistency for delivery while preserving dedupe.'],
                ['Carrier failures often show up as delivery receipt anomalies, not API errors.'],
                ['Track delivery outcomes per locale and channel.'],
              ),
            },
            {
              id: 'meeting-metrics',
              type: 'prometheus',
              label: 'Prometheus',
              x: 765,
              y: 540,
              parent: 'meeting-external',
              meta: 'Join success + lag + burn rate',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 5000, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-passive',
              },
              architectureNotes: architect(
                'Observability focuses on join success, websocket reconnect rate, invite delay, and recording completion age rather than infrastructure health alone.',
                ['Golden signals', 'SLO burn-rate alerts'],
                ['Metrics can be eventually consistent as long as operator response remains fast.'],
                ['If only CPU/memory are tracked, meeting experience regressions will be missed.'],
                ['Publish business SLIs for join, reconnect, reminder latency, and recording readiness.'],
              ),
            },
          ],
          groups,
        ),
      ],
      edges: edgesFromSeeds([
        // Client → edge (control plane)
        { id: 'meet-e1', from: 'meeting-web', to: 'meeting-cdn', protocol: 'rest', description: 'Static assets + lobby bootstrap', latencyMsHint: 30, criticality: 'critical' },
        { id: 'meet-e2', from: 'meeting-cdn', to: 'meeting-gw', protocol: 'rest', description: 'Cache miss → origin', latencyMsHint: 25, criticality: 'critical' },
        { id: 'meet-e3', from: 'meeting-ios', to: 'meeting-gw', protocol: 'rest', description: 'Session bootstrap + metadata', latencyMsHint: 120, criticality: 'critical' },
        { id: 'meet-e4', from: 'meeting-android', to: 'meeting-gw', protocol: 'rest', description: 'Session bootstrap + metadata', latencyMsHint: 120, criticality: 'critical' },

        // Gateway fan-out
        { id: 'meet-e5', from: 'meeting-gw', to: 'identity', protocol: 'rest', description: 'Token validation + role hydrate', latencyMsHint: 15, criticality: 'critical' },
        { id: 'meet-e6', from: 'meeting-gw', to: 'meeting-service', protocol: 'rest', description: 'Meeting CRUD + invite orchestration', latencyMsHint: 25, criticality: 'critical' },

        // Realtime control plane (signaling — WebRTC handshake only)
        { id: 'meet-e7', from: 'meeting-web', to: 'signaling', protocol: 'websocket', async: true, description: 'WebRTC offer/answer + roster events', latencyMsHint: 25, criticality: 'critical' },
        { id: 'meet-e8', from: 'meeting-ios', to: 'signaling', protocol: 'websocket', async: true, description: 'WebRTC offer/answer + roster events', latencyMsHint: 25, criticality: 'critical' },
        { id: 'meet-e9', from: 'meeting-android', to: 'signaling', protocol: 'websocket', async: true, description: 'WebRTC offer/answer + roster events', latencyMsHint: 25, criticality: 'critical' },

        // Realtime data plane (media — RTP/SRTP via SFU)
        { id: 'meet-e21', from: 'meeting-web', to: 'media-sfu', protocol: 'websocket', async: true, description: 'Audio/video RTP publish + subscribe', latencyMsHint: 40, criticality: 'critical' },
        { id: 'meet-e22', from: 'meeting-ios', to: 'media-sfu', protocol: 'websocket', async: true, description: 'Audio/video RTP publish + subscribe', latencyMsHint: 40, criticality: 'critical' },
        { id: 'meet-e23', from: 'meeting-android', to: 'media-sfu', protocol: 'websocket', async: true, description: 'Audio/video RTP publish + subscribe', latencyMsHint: 40, criticality: 'critical' },
        { id: 'meet-e24', from: 'media-sfu', to: 'meeting-cache', protocol: 'redis', description: 'SFU pod health + active-pod registry', latencyMsHint: 2, criticality: 'normal' },

        // Signaling state
        { id: 'meet-e10', from: 'signaling', to: 'meeting-cache', protocol: 'redis', description: 'Ephemeral session + presence state', latencyMsHint: 2, criticality: 'normal' },

        // Domain → data
        { id: 'meet-e11', from: 'meeting-service', to: 'meeting-db', protocol: 'sql', description: 'Durable meeting + billing state', latencyMsHint: 8, criticality: 'critical' },
        { id: 'meet-e12', from: 'meeting-service', to: 'meeting-events', protocol: 'kafka', async: true, description: 'Outbox-driven side effects', latencyMsHint: 12, criticality: 'background' },

        // Async fan-out (consumers)
        { id: 'meet-e13', from: 'meeting-events', to: 'recording-worker', protocol: 'kafka', async: true, description: 'RecordingRequested events', latencyMsHint: 15, criticality: 'background' },
        { id: 'meet-e14', from: 'meeting-events', to: 'notifier', protocol: 'kafka', async: true, description: 'InvitationRequested + reminder fan-out', latencyMsHint: 15, criticality: 'background' },
        { id: 'meet-e25', from: 'recording-worker', to: 'recording-manifest-db', protocol: 'sql', description: 'Manifest + segment metadata writes', latencyMsHint: 10, criticality: 'normal' },
        { id: 'meet-e15', from: 'recording-worker', to: 'recordings', protocol: 'rest', async: true, description: 'Multi-part media upload to S3', latencyMsHint: 800, criticality: 'background' },

        // DLQ paths
        { id: 'meet-e26', from: 'recording-worker', to: 'notification-dlq', protocol: 'kafka', async: true, description: 'Failed recording jobs after retry budget', latencyMsHint: 15, criticality: 'background' },
        { id: 'meet-e27', from: 'notifier', to: 'notification-dlq', protocol: 'kafka', async: true, description: 'Failed notifications after retry budget', latencyMsHint: 15, criticality: 'background' },

        // Reminder cron → outbox
        { id: 'meet-e28', from: 'reminder-job', to: 'meeting-events', protocol: 'kafka', async: true, description: 'ReminderRequested events (10m cadence)', latencyMsHint: 12, criticality: 'background' },

        // External
        { id: 'meet-e16', from: 'meeting-service', to: 'meeting-stripe', protocol: 'rest', description: 'Subscription checkout (Idempotency-Key)', latencyMsHint: 250, criticality: 'normal' },
        { id: 'meet-e17', from: 'notifier', to: 'meeting-email', protocol: 'rest', async: true, description: 'Invitation email delivery', latencyMsHint: 800, criticality: 'background' },
        { id: 'meet-e18', from: 'notifier', to: 'meeting-sms', protocol: 'rest', async: true, description: 'Reminder SMS delivery', latencyMsHint: 1200, criticality: 'background' },

        // Observability
        { id: 'meet-e19', from: 'meeting-service', to: 'meeting-metrics', protocol: 'rest', async: true, description: 'Meeting lifecycle SLIs', latencyMsHint: 10, criticality: 'background' },
        { id: 'meet-e20', from: 'signaling', to: 'meeting-metrics', protocol: 'rest', async: true, description: 'Realtime connection metrics', latencyMsHint: 10, criticality: 'background' },
        { id: 'meet-e29', from: 'media-sfu', to: 'meeting-metrics', protocol: 'rest', async: true, description: 'Per-pod RTP fan-out + bandwidth metrics', latencyMsHint: 10, criticality: 'background' },
      ]),
    };
  },
};

/* -------------------------------------------------------------------------- */
/*                             URL Shortener                                  */
/* -------------------------------------------------------------------------- */

const URL_PRIMARY_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'varchar(255)', nullable: false, primaryKey: false, unique: true },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [{ name: 'shortener_users_email_idx', columns: ['email'], unique: true }],
    },
    {
      name: 'short_links',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'slug', type: 'varchar(16)', nullable: false, primaryKey: false, unique: true },
        { name: 'target_url', type: 'text', nullable: false, primaryKey: false },
        { name: 'owner_id', type: 'uuid', nullable: true, primaryKey: false, foreignKey: { table: 'users', column: 'id' } },
        { name: 'status', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'active'" },
        { name: 'expires_at', type: 'timestamp', nullable: true, primaryKey: false },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [
        { name: 'short_links_slug_idx', columns: ['slug'], unique: true },
        { name: 'short_links_owner_created_idx', columns: ['owner_id', 'created_at'], unique: false },
      ],
    },
    {
      name: 'custom_domains',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'owner_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'users', column: 'id' } },
        { name: 'hostname', type: 'varchar(255)', nullable: false, primaryKey: false, unique: true },
        { name: 'verification_status', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'pending'" },
        { name: 'verified_at', type: 'timestamp', nullable: true, primaryKey: false },
      ],
      indexes: [{ name: 'domains_owner_idx', columns: ['owner_id'], unique: false }],
    },
  ],
};

const URL_ANALYTICS_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'clicks_raw',
      columns: [
        { name: 'event_id', type: 'UUID', nullable: false, primaryKey: true },
        { name: 'slug', type: 'String', nullable: false, primaryKey: false },
        { name: 'ts', type: 'DateTime', nullable: false, primaryKey: false },
        { name: 'country', type: 'FixedString(2)', nullable: true, primaryKey: false },
        { name: 'device_class', type: 'String', nullable: true, primaryKey: false },
        { name: 'referrer', type: 'String', nullable: true, primaryKey: false },
      ],
      indexes: [{ name: 'clicks_raw_slug_ts_idx', columns: ['slug', 'ts'], unique: false }],
    },
    {
      name: 'clicks_daily',
      columns: [
        { name: 'slug', type: 'String', nullable: false, primaryKey: true },
        { name: 'day', type: 'Date', nullable: false, primaryKey: true },
        { name: 'count', type: 'UInt64', nullable: false, primaryKey: false },
        { name: 'unique_visitors', type: 'UInt64', nullable: false, primaryKey: false },
      ],
      indexes: [],
    },
  ],
};

const URL_MANAGEMENT_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://short.example.com/api',
      endpoints: [
        {
          method: 'POST',
          path: '/links',
          description: 'Create a managed short link.',
          request: [
            field('targetUrl', 'string'),
            field('customSlug', 'string', 'Optional vanity slug', true),
            field('expiresAt', 'timestamp', 'Optional expiry', true),
          ],
          response: [
            field('linkId', 'uuid'),
            field('slug', 'string'),
            field('shortUrl', 'string'),
          ],
          statusCodes: ['201', '409', '422'],
        },
        {
          method: 'GET',
          path: '/links/:linkId',
          response: [
            field('linkId', 'uuid'),
            field('targetUrl', 'string'),
            field('status', 'string'),
            field('clickCount', 'integer'),
          ],
          statusCodes: ['200', '404'],
        },
        {
          method: 'GET',
          path: '/me/links',
          response: [
            field('items', 'ShortLinkSummary[]'),
            field('nextCursor', 'string', 'Pagination cursor', true),
          ],
          statusCodes: ['200'],
        },
        {
          method: 'POST',
          path: '/domains/verify',
          request: [field('hostname', 'string')],
          response: [
            field('challengeHost', 'string'),
            field('challengeValue', 'string'),
          ],
          statusCodes: ['200', '409'],
        },
      ],
    },
  ],
};

const URL_REDIRECT_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://go.short.example.com',
      endpoints: [
        {
          method: 'GET',
          path: '/r/:slug',
          description: 'Resolve slug from cache, redirect to target, and emit analytics asynchronously.',
          response: [
            field('location', 'string'),
            field('cacheStatus', 'string'),
          ],
          statusCodes: ['302', '404', '410'],
        },
      ],
    },
  ],
};

const URL_EVENTS: ProducingSpec = {
  events: [
    {
      name: 'LinkClicked',
      publishers: ['redirect-api'],
      fields: [
        field('slug', 'string'),
        field('ts', 'timestamp'),
        field('country', 'string', 'ISO country', true),
        field('deviceClass', 'string', 'mobile | desktop | bot', true),
      ],
    },
    {
      name: 'LinkCreated',
      publishers: ['management-api'],
      fields: [
        field('linkId', 'uuid'),
        field('slug', 'string'),
        field('ownerId', 'uuid', 'Owner of the new link', true),
      ],
    },
  ],
};

const URL_ANALYTICS_CONSUMER: ConsumingSpec = {
  sourceNodeId: 'url-events',
  handler: 'aggregate_clicks_to_clickhouse',
  concurrency: 3,
  deadLetterNodeId: 'url-dlq',
  notes:
    'Partition key = slug; processes LinkClicked in event-time order with 5min late-arrival window. Idempotency by event_id (UUID). Failed batches DLQ to url-dlq with original payload and offset metadata.',
};

const URL_ID_GENERATOR_API: ApiSpec = {
  protocols: [
    {
      kind: 'grpc',
      baseUrl: 'idgen.short.svc.cluster.local:9090',
      endpoints: [
        {
          name: 'IdGenerator.Allocate',
          description:
            'Allocates a batch of monotonic 64-bit IDs and returns base62-encoded slugs. Single Raft leader; followers cache pre-allocated ranges (1k IDs) for sub-ms p99.',
          request: [
            field('count', 'integer', 'Batch size, 1–1000 IDs per call.'),
            field(
              'idempotencyKey',
              'uuid',
              'Optional; safe to retry within 1h window — leader replays cached batch.',
              true,
            ),
          ],
          response: [
            field('ids', 'int64[]'),
            field('slugs', 'string[]', 'base62-encoded, length 6 = 36-bit namespace = 68B.'),
          ],
          statusCodes: ['200', '503'],
        },
      ],
    },
  ],
};

const URL_SHORTENER: TemplateSpec = {
  id: 'url-shortener',
  name: 'URL Shortener',
  description: 'Reference design for hot-path redirects, durable management APIs, and async analytics',
  build: () => {
    const groups: SeedGroup[] = [
      { id: 'url-clients', label: 'Clients', x: 30, y: 20, width: 660, height: 120, tone: 'client' },
      { id: 'url-edge', label: 'Edge', x: 30, y: 160, width: 660, height: 110, tone: 'edge' },
      { id: 'url-services', label: 'Services', x: 30, y: 290, width: 660, height: 290, tone: 'service' },
      { id: 'url-data', label: 'Data and Analytics', x: 30, y: 600, width: 660, height: 240, tone: 'data' },
      { id: 'url-ops', label: 'Ops', x: 730, y: 20, width: 250, height: 820, tone: 'external' },
    ];

    return {
      nodes: [
        ...groupsFromSeeds(groups),
        ...nodesFromSeeds(
          [
            {
              id: 'url-web',
              type: 'web',
              label: 'Dashboard Web',
              x: 90,
              y: 50,
              parent: 'url-clients',
              meta: 'Campaign management UI',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 220, availability: 0.999 },
                replicas: 3,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Management dashboard focuses on safe CRUD, analytics drill-down, and domain verification flows.',
                ['Thin client', 'Cursor pagination'],
                ['Analytics freshness can lag slightly without hurting operational usability.'],
                ['Overfetching analytics on the dashboard will inflate control-plane costs.'],
                ['Separate management surfaces from redirect traffic and page analytics asynchronously.'],
              ),
            },
            {
              id: 'url-mobile',
              type: 'ios',
              label: 'Mobile Companion',
              x: 360,
              y: 50,
              parent: 'url-clients',
              meta: 'Read-only quick stats',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 260, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Mobile app is intentionally narrow and optimized for link creation plus top-line analytics checks.',
                ['Read-mostly mobile surface'],
                ['Favors availability over perfectly current analytics aggregates.'],
                ['Trying to mirror every dashboard workflow on mobile adds complexity with little value.'],
                ['Keep mobile flows focused on create, pause, and copy-link actions.'],
              ),
            },

            {
              id: 'edge-router',
              type: 'gateway',
              label: 'Edge Router',
              x: 260,
              y: 195,
              parent: 'url-edge',
              meta: 'Host + path routing',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 40, availability: 0.9999, rpsTarget: 15000 },
                replicas: 10,
                redundancy: 'multi-region',
                failureModes: ['Poisoned cache config', 'Regional failover stampede'],
              },
              architectureNotes: architect(
                'Separates redirect traffic from authenticated dashboard traffic using host and path routing rules.',
                ['Edge routing', 'Origin shielding'],
                ['Redirect availability and latency take priority over analytics or management freshness.'],
                ['A bad route rule can black-hole either dashboard or redirect traffic globally.'],
                ['Version route config and keep canary validation at the edge.'],
              ),
            },

            {
              id: 'management-api',
              type: 'service',
              label: 'Management API',
              x: 90,
              y: 335,
              parent: 'url-services',
              meta: 'Create + manage links',
              api: URL_MANAGEMENT_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EL',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 160, availability: 0.9995 },
                replicas: 4,
                redundancy: 'active-active',
                failureModes: ['Slug uniqueness hot path', 'Domain verification backlog'],
              },
              architectureNotes: architect(
                'Management API owns durable short-link records and custom-domain verification state.',
                ['Database per service', 'Optimistic uniqueness checks'],
                ['Prefers consistency so users never receive duplicate slugs or conflicting custom domains.'],
                ['Custom slug hot spots can cause lock contention if uniqueness checks are not bounded.'],
                ['Reserve slugs transactionally and move DNS verification to async flows where possible.'],
              ),
            },
            {
              id: 'redirect-api',
              type: 'service',
              label: 'Redirect Service',
              x: 360,
              y: 335,
              parent: 'url-services',
              meta: '302 path hot path',
              api: URL_REDIRECT_API,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 35, availability: 0.9999, rpsTarget: 30000 },
                replicas: 8,
                redundancy: 'multi-region',
                failureModes: ['Cache miss storms', 'Bot amplification'],
              },
              architectureNotes: architect(
                'Redirect service is deliberately tiny: resolve slug, redirect immediately, and emit analytics asynchronously.',
                ['Cache-aside', 'Write-behind analytics'],
                ['Availability and latency trump read freshness because a short lag in link disable propagation is usually acceptable.'],
                ['Bot traffic or cache miss storms can overload the primary datastore quickly.'],
                ['Keep bot filtering at the edge and prewarm the cache for top slugs.'],
              ),
            },
            {
              id: 'click-aggregator',
              type: 'kafka-consumer',
              label: 'Analytics Worker',
              x: 360,
              y: 455,
              parent: 'url-services',
              meta: 'Rollups + dedupe',
              consuming: URL_ANALYTICS_CONSUMER,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EC',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 3000, availability: 0.999 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Late-arriving event replay', 'Partition skew on viral slugs'],
              },
              architectureNotes: architect(
                'Aggregates clickstream data into a read-optimized analytics store without affecting redirect latency.',
                ['Stream processing', 'Idempotent aggregation'],
                ['Eventual analytics is acceptable as long as dashboards converge quickly.'],
                ['Viral campaigns can create severe skew by slug and delay aggregates for everyone else.'],
                ['Partition events by slug and use bounded lateness windows.'],
              ),
              notes:
                'Consumer group `clicks-aggregator-v2`. Lag SLI < 60s. 4 consumer pods key-shared by hash(slug); ensures per-slug ordering inside ClickHouse merges.',
            },
            {
              id: 'id-generator',
              type: 'service',
              label: 'ID Generator',
              x: 90,
              y: 540,
              parent: 'url-services',
              meta: 'Snowflake-style monotonic IDs · base62 slugs',
              api: URL_ID_GENERATOR_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 5, availability: 0.9999, rpsTarget: 5000 },
                replicas: 3,
                redundancy: 'active-passive',
                failureModes: ['Leader election storm', 'Range exhaustion under burst'],
              },
              architectureNotes: architect(
                'Centralized monotonic ID allocator removes the slug-uniqueness round-trip from links_db. Single Raft leader serves writes; followers pre-fetch 1k-ID ranges so reads stay local.',
                ['Snowflake / sonyflake', 'Pre-allocated ID ranges per pod', 'Leader election (Raft)'],
                ['CP: a duplicated slug is catastrophic; sequence correctness > minor latency.'],
                ['Leader failover takes ~3s; followers serve from cached ranges during transition.'],
                ['Each pod pre-fetches 1k IDs at < 30% range remaining; allocation never blocks the management hot path.'],
              ),
              notes:
                'Slug = base62(id) — 6 chars = 56-bit namespace = 72T capacity. Bloom filter (architecture note for future) eliminates DB lookup on duplicate-slug check; expected 99% true-negative rate at 100M slugs.',
            },

            {
              id: 'url-cache',
              type: 'redis',
              label: 'redirect_cache',
              x: 90,
              y: 665,
              parent: 'url-data',
              meta: 'TTL 24h + hot slug set',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'read-your-writes',
                slo: { latencyP99Ms: 6, availability: 0.9999 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Hot key churn', 'Stale disabled links'],
              },
              architectureNotes: architect(
                'Cache stores resolved slug targets and domain routing metadata for the redirect hot path.',
                ['Cache-aside', 'Soft TTL'],
                ['Low latency and high availability are more important than instant invalidation.'],
                ['Disabled or expired links may remain live until TTL expiry if invalidation is weak.'],
                ['Push invalidation on state changes and keep TTLs shorter for paid or abuse-sensitive links.'],
              ),
            },
            {
              id: 'url-db',
              type: 'postgres',
              label: 'links_db (primary)',
              x: 280,
              y: 665,
              parent: 'url-data',
              meta: 'Durable link ownership',
              schema: URL_PRIMARY_SCHEMA,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 30, availability: 0.9995 },
                replicas: 3,
                redundancy: 'active-passive',
                failureModes: ['Slug uniqueness lock contention', 'Index bloat on owner scans'],
              },
              architectureNotes: architect(
                'Primary datastore owns slug uniqueness, ownership, and domain verification state.',
                ['Database per service', 'Replica offload for read-heavy management views'],
                ['Strong consistency is required for slug creation and link disabling.'],
                ['Management and redirect queries sharing the same primary can starve one another under load.'],
                ['Keep redirect reads cache-first and route management reports to replicas or analytics stores.'],
              ),
            },
            {
              id: 'url-events',
              type: 'kafka',
              label: 'click_events',
              x: 470,
              y: 665,
              parent: 'url-data',
              meta: 'Clicks + link lifecycle',
              producing: URL_EVENTS,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EC',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 150, availability: 0.9995 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Topic lag during viral spikes', 'Cross-region ordering loss'],
              },
              architectureNotes: architect(
                'Kafka decouples redirect latency from click analytics and management-side lifecycle notifications.',
                ['Async event pipeline'],
                ['Losing strict order is acceptable for analytics as long as dedupe and replay remain safe.'],
                ['Backlog age grows very quickly during viral spikes and can silently degrade dashboards.'],
                ['Alert on event age percentiles and provision partitions for the top slug distribution.'],
              ),
            },
            {
              id: 'analytics-db',
              type: 'clickhouse',
              label: 'analytics_db',
              x: 660,
              y: 665,
              parent: 'url-data',
              meta: 'Daily and raw click rollups',
              schema: URL_ANALYTICS_SCHEMA,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 120, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-active',
                failureModes: ['Merge backlog', 'Expensive ad hoc queries'],
              },
              architectureNotes: architect(
                'ClickHouse keeps analytical scans away from the operational datastore and supports rollups for customer dashboards.',
                ['Columnar analytics store', 'Materialized rollups'],
                ['Analytics can be eventually consistent without affecting redirect correctness.'],
                ['Unbounded raw-retention or arbitrary queries can degrade ingestion performance.'],
                ['Precompute daily aggregates and enforce retention plus query budgets.'],
              ),
              notes:
                'Retention: clicks_raw 90d (then S3 cold tier), clicks_daily forever. Sharded by hash(slug) % 4. Materialized view: clicks_raw → clicks_daily computed every 5min.',
            },
            {
              id: 'url-db-replica',
              type: 'postgres',
              label: 'links_db_ro',
              x: 280,
              y: 745,
              parent: 'url-data',
              meta: 'Async streaming replica · management reads',
              schema: URL_PRIMARY_SCHEMA,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 20, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-active',
                failureModes: ['Replication lag during bulk imports', 'Long management list queries hold locks'],
              },
              architectureNotes: architect(
                'Read replica off-loads dashboard list views and analytics joins from the primary so slug-write QPS keeps headroom.',
                ['Read replica', 'Async streaming replication', 'Bounded staleness'],
                ['Trades freshness for read availability; writes still go to primary so consistency is bounded staleness (~5s).'],
                ['Replica lag during bulk csv imports surfaces stale link list to dashboard.'],
                ['Reject reads on lag > 5s; route fallback to primary with budget cap.'],
              ),
              notes: 'Mode: streaming, async (wal_level=replica). Failover: promote on primary loss. RTO 60s, RPO ≤ 5s.',
            },
            {
              id: 'url-dlq',
              type: 'kafka',
              label: 'click_events_dlq',
              x: 470,
              y: 745,
              parent: 'url-data',
              meta: 'Poison events + replay',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 200, availability: 0.999 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['DLQ overflow on viral burst', 'Operator forgets to drain'],
              },
              architectureNotes: architect(
                'Dead-letter topic for click-aggregator failures (parse errors, ClickHouse insert errors after retry budget). Retains failed events for inspection + manual replay so the live click_events topic stays clean.',
                ['DLQ pattern', 'Manual replay', 'Failure isolation'],
                ['Eventual: DLQ correctness > latency.'],
                ['DLQ growth without alerts means silent analytics drift.'],
                ['Alert on depth > 1000 messages; replay tool requires explicit confirm + idempotency check.'],
              ),
              notes: 'Retention 14d. Each message tagged with consumer_group, error_class, original offset, attempt count.',
            },
            {
              id: 'url-metrics',
              type: 'prometheus',
              label: 'Prometheus',
              x: 785,
              y: 585,
              parent: 'url-ops',
              meta: 'Redirect p99 + cache hit',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 5000, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-passive',
              },
              architectureNotes: architect(
                'Operational success is measured by redirect latency, cache hit rate, cache invalidation delay, and event backlog age.',
                ['Golden signals', 'Business SLIs'],
                ['Metrics can lag slightly if incident detection stays within minutes.'],
                ['Tracking only CPU or memory misses the real cost drivers in redirect systems.'],
                ['Expose cache hit, 404 rate, viral-slug skew, and click-event lag as first-class dashboards.'],
              ),
            },
          ],
          groups,
        ),
      ],
      edges: edgesFromSeeds([
        // Client → edge
        { id: 'url-e1', from: 'url-web', to: 'edge-router', protocol: 'rest', description: 'Dashboard traffic', latencyMsHint: 60, criticality: 'critical' },
        { id: 'url-e2', from: 'url-mobile', to: 'edge-router', protocol: 'rest', description: 'Companion app traffic', latencyMsHint: 120, criticality: 'critical' },

        // Edge fan-out (split: management vs redirect hot path)
        { id: 'url-e3', from: 'edge-router', to: 'management-api', protocol: 'rest', description: 'Authenticated management routes', latencyMsHint: 25, criticality: 'critical' },
        { id: 'url-e4', from: 'edge-router', to: 'redirect-api', protocol: 'rest', description: 'Public redirect hot path (302)', latencyMsHint: 15, criticality: 'critical' },

        // Management write path
        { id: 'url-e14', from: 'management-api', to: 'id-generator', protocol: 'grpc', description: 'Allocate monotonic ID + base62 slug', latencyMsHint: 5, criticality: 'critical' },
        { id: 'url-e5', from: 'management-api', to: 'url-db', protocol: 'sql', description: 'Persist link with allocated slug', latencyMsHint: 8, criticality: 'critical' },
        { id: 'url-e15', from: 'management-api', to: 'url-db-replica', protocol: 'sql', description: 'Dashboard list views + owner queries', latencyMsHint: 10, criticality: 'normal' },
        { id: 'url-e6', from: 'management-api', to: 'url-events', protocol: 'kafka', async: true, description: 'LinkCreated / LinkDisabled events', latencyMsHint: 12, criticality: 'background' },

        // Redirect hot path (cache-first)
        { id: 'url-e7', from: 'redirect-api', to: 'url-cache', protocol: 'redis', description: 'Hot path slug resolution (≥98% hit ratio target)', latencyMsHint: 1, criticality: 'critical' },
        { id: 'url-e8', from: 'redirect-api', to: 'url-db-replica', protocol: 'sql', description: 'Cache miss → read replica fallback', latencyMsHint: 10, criticality: 'normal' },
        { id: 'url-e9', from: 'redirect-api', to: 'url-events', protocol: 'kafka', async: true, description: 'LinkClicked events (write-behind)', latencyMsHint: 12, criticality: 'background' },

        // Analytics pipeline (async)
        { id: 'url-e10', from: 'url-events', to: 'click-aggregator', protocol: 'kafka', async: true, description: 'Click rollup processing', latencyMsHint: 15, criticality: 'background' },
        { id: 'url-e11', from: 'click-aggregator', to: 'analytics-db', protocol: 'sql', description: 'Aggregate writes (batch insert)', latencyMsHint: 20, criticality: 'normal' },
        { id: 'url-e16', from: 'click-aggregator', to: 'url-dlq', protocol: 'kafka', async: true, description: 'Failed batches after retry budget', latencyMsHint: 15, criticality: 'background' },

        // Observability
        { id: 'url-e12', from: 'management-api', to: 'url-metrics', protocol: 'rest', async: true, description: 'CRUD + domain verification SLIs', latencyMsHint: 10, criticality: 'background' },
        { id: 'url-e13', from: 'redirect-api', to: 'url-metrics', protocol: 'rest', async: true, description: 'Redirect p99 + cache hit rate', latencyMsHint: 10, criticality: 'background' },
        { id: 'url-e17', from: 'id-generator', to: 'url-metrics', protocol: 'rest', async: true, description: 'ID allocation rate + leader election lag', latencyMsHint: 10, criticality: 'background' },
      ]),
    };
  },
};

/* -------------------------------------------------------------------------- */
/*                              Realtime Chat                                 */
/* -------------------------------------------------------------------------- */

const CHAT_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'username', type: 'varchar(64)', nullable: false, primaryKey: false, unique: true },
        { name: 'display_name', type: 'varchar(120)', nullable: false, primaryKey: false },
        { name: 'avatar_url', type: 'text', nullable: true, primaryKey: false },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [{ name: 'chat_users_username_idx', columns: ['username'], unique: true }],
    },
    {
      name: 'rooms',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'name', type: 'varchar(120)', nullable: false, primaryKey: false },
        { name: 'room_type', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'group'" },
        { name: 'created_by', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'users', column: 'id' } },
        { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [],
    },
    {
      name: 'room_members',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'room_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'rooms', column: 'id' } },
        { name: 'user_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'users', column: 'id' } },
        { name: 'role', type: 'varchar(24)', nullable: false, primaryKey: false, default: "'member'" },
        { name: 'joined_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
      ],
      indexes: [{ name: 'chat_room_members_unique', columns: ['room_id', 'user_id'], unique: true }],
    },
    {
      name: 'messages',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'room_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'rooms', column: 'id' } },
        { name: 'sender_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'users', column: 'id' } },
        { name: 'body', type: 'text', nullable: false, primaryKey: false },
        { name: 'sent_at', type: 'timestamp', nullable: false, primaryKey: false, default: 'now()' },
        { name: 'edited_at', type: 'timestamp', nullable: true, primaryKey: false },
      ],
      indexes: [{ name: 'chat_messages_room_sent_idx', columns: ['room_id', 'sent_at'], unique: false }],
    },
    {
      name: 'message_receipts',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'message_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'messages', column: 'id' } },
        { name: 'user_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'users', column: 'id' } },
        { name: 'delivered_at', type: 'timestamp', nullable: true, primaryKey: false },
        { name: 'read_at', type: 'timestamp', nullable: true, primaryKey: false },
      ],
      indexes: [{ name: 'chat_receipts_message_user_unique', columns: ['message_id', 'user_id'], unique: true }],
    },
  ],
};

const CHAT_GATEWAY_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://chat.example.com/api',
      endpoints: [
        {
          method: 'GET',
          path: '/bootstrap',
          response: [
            field('user', 'CurrentUser', 'Authenticated principal', true),
            field('featureFlags', 'string[]'),
            field('presenceUrl', 'string'),
          ],
          statusCodes: ['200'],
        },
      ],
    },
  ],
};

const CHAT_AUTH_API: ApiSpec = {
  protocols: [
    {
      kind: 'rest',
      baseUrl: 'https://identity.chat.example.com',
      endpoints: [
        {
          method: 'POST',
          path: '/login',
          request: [field('username', 'string'), field('password', 'string')],
          response: [field('accessToken', 'jwt'), field('refreshToken', 'jwt')],
          statusCodes: ['200', '401'],
        },
        {
          method: 'POST',
          path: '/refresh',
          request: [field('refreshToken', 'jwt')],
          response: [field('accessToken', 'jwt')],
          statusCodes: ['200', '401'],
        },
        {
          method: 'GET',
          path: '/me',
          response: [field('userId', 'uuid'), field('username', 'string'), field('displayName', 'string')],
          statusCodes: ['200', '401'],
        },
      ],
    },
  ],
};

const CHAT_HUB_API: ApiSpec = {
  protocols: [
    {
      kind: 'signalr',
      baseUrl: 'wss://chat.example.com/hub',
      endpoints: [
        {
          name: 'JoinRoom(roomId)',
          request: [field('roomId', 'uuid')],
          response: [field('connectionAccepted', 'boolean')],
          description: 'Subscribes connection to room streams.',
        },
        {
          name: 'SendMessage(roomId, body)',
          request: [field('roomId', 'uuid'), field('body', 'string')],
          response: [field('messageId', 'uuid'), field('sentAt', 'timestamp')],
        },
        {
          name: 'MarkRead(messageId)',
          request: [field('messageId', 'uuid')],
          response: [field('accepted', 'boolean')],
        },
        {
          events: ['MessageReceived', 'ReadReceiptUpdated', 'UserJoined', 'UserLeft'],
          response: [field('payload', 'RealtimeEventPayload')],
          description: 'Realtime room callbacks.',
        },
      ],
    },
    {
      kind: 'rest',
      baseUrl: 'https://chat.example.com/api',
      endpoints: [
        {
          method: 'GET',
          path: '/rooms',
          response: [field('rooms', 'RoomSummary[]')],
          statusCodes: ['200'],
        },
        {
          method: 'POST',
          path: '/rooms',
          request: [field('name', 'string'), field('memberIds', 'uuid[]')],
          response: [field('roomId', 'uuid')],
          statusCodes: ['201'],
        },
        {
          method: 'GET',
          path: '/rooms/:roomId/messages',
          request: [field('cursor', 'string', 'Pagination cursor', true)],
          response: [
            field('messages', 'MessageDto[]'),
            field('nextCursor', 'string', 'Pagination cursor', true),
          ],
          statusCodes: ['200', '404'],
        },
      ],
    },
  ],
};

const CHAT_PRESENCE_API: ApiSpec = {
  protocols: [
    {
      kind: 'websocket',
      baseUrl: 'wss://chat.example.com/presence',
      endpoints: [
        {
          events: ['presence.online', 'presence.offline', 'presence.typing'],
          description: 'Ephemeral presence pub-sub channel.',
          response: [field('userId', 'uuid'), field('roomId', 'uuid', 'Only for typing events', true)],
        },
      ],
    },
  ],
};

const CHAT_EVENTS: ProducingSpec = {
  events: [
    {
      name: 'MessageSent',
      publishers: ['chat-hub'],
      fields: [
        field('messageId', 'uuid'),
        field('roomId', 'uuid'),
        field('senderId', 'uuid'),
        field('body', 'string'),
      ],
    },
    {
      name: 'UserMentioned',
      publishers: ['chat-hub'],
      fields: [
        field('messageId', 'uuid'),
        field('mentionedUserId', 'uuid'),
        field('roomId', 'uuid'),
      ],
    },
  ],
};

const CHAT_FANOUT_CONSUMER: ConsumingSpec = {
  sourceNodeId: 'chat-events',
  handler: 'fanout_push_and_email_notifications',
  concurrency: 6,
  deadLetterNodeId: 'chat-dlq',
  notes:
    'Consumes MessageSent + UserMentioned. Per-user dedup window 30s on (user_id, message_id) stored in presence-cache. Mobile push (FCM/APNS) and web push are routed by user device prefs; provider failure does not block the other channel.',
};

const CHAT_PERSISTER_CONSUMING: ConsumingSpec = {
  sourceNodeId: 'chat-events',
  handler: 'persist_message_to_history',
  concurrency: 8,
  deadLetterNodeId: 'chat-dlq',
  notes:
    'Write-behind persistence: chat-hub publishes to Kafka first (in-memory, AP), then this consumer durably writes to chat_db. Idempotency key = message_id (ULID). At-least-once + dedup; unique index on chat_db.messages(message_id).',
};

const REALTIME_CHAT: TemplateSpec = {
  id: 'realtime-chat',
  name: 'Realtime Chat',
  description: 'SignalR and websocket reference with event-driven fan-out and explicit presence handling',
  build: () => {
    const groups: SeedGroup[] = [
      { id: 'chat-clients', label: 'Clients', x: 30, y: 20, width: 660, height: 120, tone: 'client' },
      { id: 'chat-edge', label: 'Edge and Auth', x: 30, y: 160, width: 660, height: 110, tone: 'edge' },
      { id: 'chat-core', label: 'Realtime Core', x: 30, y: 290, width: 660, height: 290, tone: 'service' },
      { id: 'chat-data', label: 'Data and Event Backbone', x: 30, y: 600, width: 660, height: 240, tone: 'data' },
      { id: 'chat-ops', label: 'External and Ops', x: 730, y: 20, width: 250, height: 820, tone: 'external' },
    ];

    return {
      nodes: [
        ...groupsFromSeeds(groups),
        ...nodesFromSeeds(
          [
            {
              id: 'chat-web',
              type: 'web',
              label: 'Web App',
              x: 90,
              y: 50,
              parent: 'chat-clients',
              meta: 'Desktop-first collaboration',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 220, availability: 0.999 },
                replicas: 3,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Web app keeps chat history fetches separate from websocket joins so room navigation remains responsive during transient backend slowness.',
                ['Lazy history hydrate', 'Optimistic UI'],
                ['Short-lived presence staleness is acceptable if message send and receive stay available.'],
                ['Blocking room navigation on history queries will hurt perceived realtime performance.'],
                ['Fetch history progressively and let websocket events fill gaps.'],
              ),
            },
            {
              id: 'chat-mobile',
              type: 'ios',
              label: 'Mobile App',
              x: 360,
              y: 50,
              parent: 'chat-clients',
              meta: 'Push-aware mobile client',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 280, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-active',
              },
              architectureNotes: architect(
                'Mobile prioritizes reconnect speed, unread accuracy, and push fan-out over perfect live-presence fidelity.',
                ['Push-first reconnect', 'Offline queue'],
                ['Unread state can converge eventually while send/receive reliability remains strong.'],
                ['Background reconnect storms can overwhelm the presence gateway after outages.'],
                ['Backoff reconnects and collapse unread updates into coarse deltas.'],
              ),
            },

            {
              id: 'chat-gateway',
              type: 'gateway',
              label: 'Gateway',
              x: 90,
              y: 195,
              parent: 'chat-edge',
              meta: 'Bootstrap + auth edge',
              api: CHAT_GATEWAY_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EL',
                consistencyModel: 'read-your-writes',
                slo: { latencyP99Ms: 140, availability: 0.9995 },
                replicas: 4,
                redundancy: 'active-active',
                failureModes: ['Downstream fan-out', 'Session bootstrap inflation'],
              },
              architectureNotes: architect(
                'Gateway handles bootstrap and token exchange but avoids owning room logic or websocket state.',
                ['Backend-for-frontend', 'Timeout budgets'],
                ['Session issuance needs stronger consistency than presence or typing metadata.'],
                ['A fat gateway becomes a second monolith and obscures room ownership boundaries.'],
                ['Keep only auth and bootstrap composition here.'],
              ),
            },
            {
              id: 'chat-auth',
              type: 'auth',
              label: 'Identity',
              x: 360,
              y: 195,
              parent: 'chat-edge',
              meta: 'JWT + refresh',
              api: CHAT_AUTH_API,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 130, availability: 0.9995 },
                replicas: 4,
                redundancy: 'active-active',
                failureModes: ['Refresh token replay', 'Signing-key skew'],
              },
              architectureNotes: architect(
                'Auth owns the user session lifecycle so the chat hub only trusts short-lived tokens.',
                ['Short-lived JWT', 'Refresh token rotation'],
                ['Consistency on revocation matters more than the lowest possible login latency.'],
                ['A signing-key skew can eject active users from every room.'],
                ['Stage key rollouts and verify hub trust bundles continuously.'],
              ),
            },

            {
              id: 'chat-hub',
              type: 'signalr',
              label: 'Chat Hub',
              x: 90,
              y: 335,
              parent: 'chat-core',
              meta: 'Room fan-in/out',
              api: CHAT_HUB_API,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'read-your-writes',
                slo: { latencyP99Ms: 60, availability: 0.9999, rpsTarget: 10000 },
                replicas: 8,
                redundancy: 'active-active',
                failureModes: ['Hot room shard skew', 'Message duplication on retries'],
              },
              architectureNotes: architect(
                'Chat hub handles in-memory room fan-out only. Durable history is written by the message-persister consumer asynchronously, decoupling AP send latency from CP DB writes.',
                ['Dedicated realtime hub', 'Idempotent send by message_id (ULID)', 'Sticky routing by hash(roomId) % N', 'Write-behind persistence via Kafka'],
                ['AP/PA-EL: hub stays available under partition; message_persister handles CP durability separately.'],
                ['Hot rooms can overload single shards; client retries can duplicate without ULID dedup.'],
                ['Shard by room ID via consistent-hash router (lb upstream); dedup client retries by message_id.'],
              ),
              notes:
                'Connection routing: client → load balancer (consistent-hash by `roomId` cookie) → chat-hub-N. SLO p99: hub→Kafka < 5ms; persister→DB has separate SLO 50ms. Retry policy: client resends with same message_id (ULID).',
            },
            {
              id: 'presence',
              type: 'websocket',
              label: 'Presence Gateway',
              x: 360,
              y: 335,
              parent: 'chat-core',
              meta: 'Typing + online state',
              api: CHAT_PRESENCE_API,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 40, availability: 0.9999, rpsTarget: 15000 },
                replicas: 6,
                redundancy: 'active-active',
                failureModes: ['Reconnect storms', 'Ghost online state after disconnect'],
              },
              architectureNotes: architect(
                'Presence is intentionally ephemeral and separate from message durability so outages do not affect core history writes.',
                ['Ephemeral state gateway'],
                ['Typing and online status can be eventually consistent without user harm.'],
                ['Presence TTL bugs create ghost users and erode trust quickly.'],
                ['Use short TTLs, heartbeat renewal, and presence-specific dashboards.'],
              ),
            },
            {
              id: 'fanout',
              type: 'consumer',
              label: 'Notification Fan-out',
              x: 360,
              y: 455,
              parent: 'chat-core',
              meta: 'Push + digests',
              consuming: CHAT_FANOUT_CONSUMER,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 2500, availability: 0.999 },
                replicas: 6,
                redundancy: 'active-active',
                failureModes: ['Mention storm backlog', 'Duplicate notification sends'],
              },
              architectureNotes: architect(
                'Async fan-out handles mobile push (FCM/APNS) and web push without touching the room send path. Provider-isolated: FCM outage does not block APNS or web push.',
                ['Async notification worker', 'Per-channel provider isolation', 'Digest batching', 'Per-user dedup window'],
                ['Eventual delivery acceptable; mentions can lag a few seconds without breaking correctness.'],
                ['Mention storms (channel-wide @here) create backlog that delays priority alerts.'],
                ['Classify by priority (mention > digest > marketing); dedup window 30s on (user_id, message_id).'],
              ),
              notes:
                'Provider matrix: mobile → FCM/APNS; web → Web Push API (VAPID). Each channel has its own retry budget (3 attempts exponential) and DLQ shared via chat-dlq. Dedup state in presence-cache TTL 30s.',
            },
            {
              id: 'message-persister',
              type: 'kafka-consumer',
              label: 'Message Persister',
              x: 90,
              y: 540,
              parent: 'chat-core',
              meta: 'Write-behind chat_db',
              consuming: CHAT_PERSISTER_CONSUMING,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 50, availability: 0.999 },
                replicas: 4,
                redundancy: 'active-active',
                failureModes: ['DB primary failover during burst', 'Schema migration during indexing'],
              },
              architectureNotes: architect(
                'Bridges the AP chat-hub to the CP chat_db. Hub publishes to Kafka first (in-memory, low latency); persister durably writes history asynchronously. Decouples send-latency SLO from DB write-latency SLO.',
                ['Write-behind / change-data-capture pattern', 'At-least-once + dedup by message_id (ULID)', 'Bulk insert batching'],
                ['CP target: history durability matters more than persister latency; replicas active-active behind partition.'],
                ['Persister lag delays history visibility (history fetch may miss recent messages).'],
                ['Alert on consumer lag > 5s. Hub returns ack=stored only after persister confirms (optional sync mode for compliance rooms).'],
              ),
              notes:
                'Per-partition consumer (partition key = room_id) preserves per-room ordering. Bulk insert: batches up to 100 messages or 200ms window. Backlog SLI alerts: > 5s warn, > 30s page.',
            },

            {
              id: 'chat-db',
              type: 'postgres',
              label: 'chat_db',
              x: 90,
              y: 665,
              parent: 'chat-data',
              meta: 'History + receipts',
              schema: CHAT_SCHEMA,
              reliability: {
                cap: 'CP',
                pacelc: 'PC/EC',
                consistencyModel: 'strong',
                slo: { latencyP99Ms: 32, availability: 0.9995 },
                replicas: 3,
                redundancy: 'active-passive',
                failureModes: ['Hot room index contention', 'Receipt write amplification'],
              },
              architectureNotes: architect(
                'Postgres stores durable room membership, message history, and read receipts while the hub handles in-memory distribution.',
                ['Durable message ledger', 'Read replicas'],
                ['History writes and receipt state need strong guarantees within a room.'],
                ['Very large rooms can create write amplification on receipt updates.'],
                ['Batch or collapse receipts and keep room history paginated by sent_at.'],
              ),
            },
            {
              id: 'presence-cache',
              type: 'redis',
              label: 'presence_cache',
              x: 280,
              y: 665,
              parent: 'chat-data',
              meta: 'TTL 30s + counters',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 7, availability: 0.9999 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Ghost presence', 'Memory pressure during all-hands'],
              },
              architectureNotes: architect(
                'Redis backs ephemeral presence, typing indicators, and small per-room rate limits.',
                ['Ephemeral cache', 'Token bucket rate limit'],
                ['Low latency and availability matter more than durable exactness.'],
                ['Long TTL or missed disconnects create ghost online users.'],
                ['Use heartbeat-based expiry and keep separate keys for online vs typing.'],
              ),
            },
            {
              id: 'chat-events',
              type: 'kafka',
              label: 'message_events',
              x: 470,
              y: 665,
              parent: 'chat-data',
              meta: 'Mentions + side effects',
              producing: CHAT_EVENTS,
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EC',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 150, availability: 0.9995 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['Topic lag on viral rooms', 'Consumer replay gaps'],
              },
              architectureNotes: architect(
                'Kafka is the durable backbone. chat-hub publishes ALL message events here first; both message-persister (durability) and fanout (notifications) consume independently. Per-room ordering preserved via partition key = room_id.',
                ['Async event pipeline', 'Partition by room_id', 'Fan-out via consumer groups'],
                ['Global event ordering is not required as long as per-room replay stays stable.'],
                ['Hot rooms can skew partitions; one slow consumer group does not block others.'],
                ['Track backlog age per consumer group; alert on `messages` topic lag > 5s.'],
              ),
              notes:
                'Topics: messages (24 partitions, 7d retention, key=room_id), mentions (12 partitions, 30d retention). Min in-sync replicas = 2. Compacted topic for room-state snapshots.',
            },
            {
              id: 'chat-dlq',
              type: 'kafka',
              label: 'chat_events_dlq',
              x: 470,
              y: 745,
              parent: 'chat-data',
              meta: 'Poison events + replay',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 200, availability: 0.999 },
                replicas: 3,
                redundancy: 'active-active',
                failureModes: ['DLQ overflow during provider outage', 'Operator drains without idempotency check'],
              },
              architectureNotes: architect(
                'Shared dead-letter topic for fanout (push delivery failures) and message-persister (DB write failures after retry budget). Live topics stay clean; failed envelopes inspectable + replayable.',
                ['DLQ pattern', 'Failure isolation', 'Manual replay tooling'],
                ['Eventual: DLQ correctness > latency; events stay until operator drains.'],
                ['Without alerts, silent provider outages can pile DLQ for hours.'],
                ['Alert at depth > 500 messages or oldest-message age > 1h.'],
              ),
              notes:
                'Retention 14d. Each message tagged with original_topic, consumer_group, error_class, attempt_count. Replay tool dedupes by (user_id, message_id) for fanout and message_id for persister.',
            },
            {
              id: 'push',
              type: 'sendgrid',
              label: 'Push and Email',
              x: 785,
              y: 335,
              parent: 'chat-ops',
              meta: 'Mention alerts',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 1800, availability: 0.995 },
                replicas: 1,
                redundancy: 'none',
              },
              architectureNotes: architect(
                'Push/email provider receives only side-effect traffic and is never required for room send success.',
                ['Async notifier'],
                ['Eventual delivery is acceptable for mention notifications.'],
                ['Provider throttling can silently degrade user trust in mentions.'],
                ['Measure provider receipts and send lag per notification class.'],
              ),
            },
            {
              id: 'chat-metrics',
              type: 'prometheus',
              label: 'Prometheus',
              x: 785,
              y: 585,
              parent: 'chat-ops',
              meta: 'Send p99 + reconnect rate',
              reliability: {
                cap: 'AP',
                pacelc: 'PA/EL',
                consistencyModel: 'eventual',
                slo: { latencyP99Ms: 5000, availability: 0.999 },
                replicas: 2,
                redundancy: 'active-passive',
              },
              architectureNotes: architect(
                'Observability should watch message send latency, reconnect rate, room skew, and notification backlog, not just CPU and socket counts.',
                ['Golden signals', 'Business SLIs'],
                ['Telemetry can lag modestly if it still enables fast incident triage.'],
                ['Socket counts alone do not reveal degraded chat experience.'],
                ['Track join success, send acks, backlog age, and ghost-presence ratios.'],
              ),
            },
          ],
          groups,
        ),
      ],
      edges: edgesFromSeeds([
        // Client → edge (control plane)
        { id: 'chat-e1', from: 'chat-web', to: 'chat-gateway', protocol: 'rest', description: 'Bootstrap + history API', latencyMsHint: 50, criticality: 'critical' },
        { id: 'chat-e2', from: 'chat-mobile', to: 'chat-gateway', protocol: 'rest', description: 'Bootstrap + history API (mobile network)', latencyMsHint: 120, criticality: 'critical' },
        { id: 'chat-e3', from: 'chat-gateway', to: 'chat-auth', protocol: 'rest', description: 'Token validation + refresh', latencyMsHint: 15, criticality: 'critical' },

        // Realtime sockets (sticky by room_id at LB layer)
        { id: 'chat-e4', from: 'chat-web', to: 'chat-hub', protocol: 'signalr', description: 'Realtime room messaging (sticky by hash(roomId))', latencyMsHint: 30, criticality: 'critical' },
        { id: 'chat-e5', from: 'chat-mobile', to: 'chat-hub', protocol: 'signalr', description: 'Realtime room messaging', latencyMsHint: 50, criticality: 'critical' },
        { id: 'chat-e6', from: 'chat-web', to: 'presence', protocol: 'websocket', async: true, description: 'Presence + typing stream', latencyMsHint: 25, criticality: 'normal' },
        { id: 'chat-e7', from: 'chat-mobile', to: 'presence', protocol: 'websocket', async: true, description: 'Presence + typing stream', latencyMsHint: 40, criticality: 'normal' },

        // Hub → Kafka (write-behind pattern)
        { id: 'chat-e10', from: 'chat-hub', to: 'chat-events', protocol: 'kafka', async: true, description: 'Hub publishes ALL message events (write-behind)', latencyMsHint: 5, criticality: 'critical' },

        // Async durability + fan-out (independent consumer groups)
        { id: 'chat-e15', from: 'chat-events', to: 'message-persister', protocol: 'kafka', async: true, description: 'Durable history projection', latencyMsHint: 15, criticality: 'background' },
        { id: 'chat-e8', from: 'message-persister', to: 'chat-db', protocol: 'sql', description: 'Bulk insert messages + receipts', latencyMsHint: 20, criticality: 'normal' },
        { id: 'chat-e11', from: 'chat-events', to: 'fanout', protocol: 'kafka', async: true, description: 'Notification fan-out', latencyMsHint: 15, criticality: 'background' },

        // Fanout → push providers
        { id: 'chat-e12', from: 'fanout', to: 'push', protocol: 'rest', async: true, description: 'Push + digest delivery (FCM/APNS/Web Push)', latencyMsHint: 800, criticality: 'background' },

        // DLQ paths
        { id: 'chat-e16', from: 'message-persister', to: 'chat-dlq', protocol: 'kafka', async: true, description: 'DB write failures after retry budget', latencyMsHint: 15, criticality: 'background' },
        { id: 'chat-e17', from: 'fanout', to: 'chat-dlq', protocol: 'kafka', async: true, description: 'Push delivery failures after retry budget', latencyMsHint: 15, criticality: 'background' },

        // Presence ephemeral state
        { id: 'chat-e9', from: 'presence', to: 'presence-cache', protocol: 'redis', description: 'Online + typing TTL keys', latencyMsHint: 2, criticality: 'normal' },
        { id: 'chat-e18', from: 'fanout', to: 'presence-cache', protocol: 'redis', description: 'Per-user dedup window (TTL 30s)', latencyMsHint: 2, criticality: 'normal' },

        // Hub history reads (cache-first via persister, fallback DB)
        { id: 'chat-e19', from: 'chat-gateway', to: 'chat-db', protocol: 'sql', description: 'History API reads (paginated by sent_at)', latencyMsHint: 15, criticality: 'normal' },

        // Observability
        { id: 'chat-e13', from: 'chat-hub', to: 'chat-metrics', protocol: 'rest', async: true, description: 'Send latency + room shard skew', latencyMsHint: 10, criticality: 'background' },
        { id: 'chat-e14', from: 'presence', to: 'chat-metrics', protocol: 'rest', async: true, description: 'Reconnect rate + TTL metrics', latencyMsHint: 10, criticality: 'background' },
        { id: 'chat-e20', from: 'message-persister', to: 'chat-metrics', protocol: 'rest', async: true, description: 'Persister lag + DB write SLI', latencyMsHint: 10, criticality: 'background' },
      ]),
    };
  },
};

export const TEMPLATES: TemplateSpec[] = [
  SHOPIFY_CLONE,
  MEETING_MONOLITH,
  URL_SHORTENER,
  REALTIME_CHAT,
];

export function findTemplate(id: string | null | undefined): TemplateSpec | undefined {
  if (!id) {
    return undefined;
  }
  return TEMPLATES.find((template) => template.id === id);
}

/**
 * Build a template and apply ELK auto-layout in a single step. The hand-tuned
 * x/y in template seeds is fine for code readability but lays the canvas out
 * with overlapping rows; running ELK on every load gives a consistent,
 * orthogonal, group-aware layout regardless of template author choices.
 *
 * Call this from any template-loading entry point (workspace menu, command
 * palette, reset-to-template) instead of `tpl.build()` directly.
 *
 * If ELK fails for any reason (bundle load, browser feature gap), we fall
 * back to the seeded coordinates so the user still gets a working canvas.
 */
export async function buildTemplateWithAutoLayout(
  tpl: TemplateSpec,
): Promise<{ nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] }> {
  const built = tpl.build();
  try {
    const { autoLayout } = await import('@/lib/layout/elk');
    const laid = await autoLayout(built.nodes, built.edges);
    return { nodes: laid, edges: built.edges };
  } catch (err) {
    console.warn(
      `[templates] auto-layout failed for ${tpl.id}, falling back to seeded positions`,
      err,
    );
    return built;
  }
}
