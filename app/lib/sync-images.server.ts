import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type AdminClient = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

const PAGE_SIZE = 25;
const MAX_PAGES = 50;

const PRODUCT_IMAGES_QUERY = `#graphql
  query SyncProductImages($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          status
          vendor
          images(first: 10) {
            edges {
              node { id url altText }
            }
          }
        }
      }
    }
  }
`;

const OTHER_FILES_QUERY = `#graphql
  query SyncOtherImages($first: Int!, $after: String) {
    files(first: $first, after: $after, query: "media_type:Image") {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          ... on MediaImage {
            id
            alt
            image { url }
          }
        }
      }
    }
  }
`;

type RawProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor?: string | null;
  images: { edges: { node: { id: string; url: string; altText?: string | null } }[] };
};

export async function syncProductImages(
  admin: AdminClient,
  shop: string,
  productStatus: "active" | "draft" | "all" = "all",
): Promise<number> {
  let after: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;
  let syncedCount = 0;
  const query = productStatus === "all" ? null : `status:${productStatus}`;

  while (hasNextPage && pageCount < MAX_PAGES) {
    const response: Response = await admin.graphql(PRODUCT_IMAGES_QUERY, {
      variables: { first: PAGE_SIZE, after, query },
    });
    const { data } = (await response.json()) as {
      data?: { products?: { edges?: { node: RawProductNode }[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } } };
    };

    const edges = data?.products?.edges ?? [];
    for (const edge of edges) {
      const product = edge.node;
      for (const imageEdge of product.images.edges) {
        const image = imageEdge.node;
        await prisma.productImage.upsert({
          where: { shop_shopifyImageId: { shop, shopifyImageId: image.id } },
          create: {
            shop,
            shopifyImageId: image.id,
            shopifyProductId: product.id,
            productTitle: product.title,
            productHandle: product.handle,
            productStatus: product.status,
            productVendor: product.vendor ?? null,
            imageUrl: image.url,
            altText: image.altText ?? null,
            status: image.altText ? "completed" : "not_generated",
          },
          update: {
            productTitle: product.title,
            productHandle: product.handle,
            productStatus: product.status,
            productVendor: product.vendor ?? null,
            imageUrl: image.url,
            altText: image.altText ?? null,
            status: image.altText ? "completed" : "not_generated",
          },
        });
        syncedCount += 1;
      }
    }

    hasNextPage = data?.products?.pageInfo?.hasNextPage ?? false;
    after = data?.products?.pageInfo?.endCursor ?? null;
    pageCount += 1;
  }

  return syncedCount;
}

type RawFileNode = { id: string; alt?: string | null; image?: { url: string } | null };

export async function syncOtherImages(admin: AdminClient, shop: string): Promise<number> {
  let after: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;
  let syncedCount = 0;

  while (hasNextPage && pageCount < MAX_PAGES) {
    const response: Response = await admin.graphql(OTHER_FILES_QUERY, {
      variables: { first: PAGE_SIZE, after },
    });
    const { data } = (await response.json()) as {
      data?: { files?: { edges?: { node: RawFileNode }[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } } };
    };

    const edges = data?.files?.edges ?? [];
    for (const edge of edges) {
      const file = edge.node;
      if (!file.image?.url) continue;
      await prisma.otherImage.upsert({
        where: { shop_shopifyFileId: { shop, shopifyFileId: file.id } },
        create: {
          shop,
          shopifyFileId: file.id,
          imageUrl: file.image.url,
          altText: file.alt ?? null,
          status: file.alt ? "completed" : "not_generated",
        },
        update: {
          imageUrl: file.image.url,
          altText: file.alt ?? null,
          status: file.alt ? "completed" : "not_generated",
        },
      });
      syncedCount += 1;
    }

    hasNextPage = data?.files?.pageInfo?.hasNextPage ?? false;
    after = data?.files?.pageInfo?.endCursor ?? null;
    pageCount += 1;
  }

  return syncedCount;
}
