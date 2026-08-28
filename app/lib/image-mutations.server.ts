import { authenticate } from "../shopify.server";

type AdminClient = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

type MutationResult = { succeeded: boolean; userErrors: { field?: string[] | null; message: string }[] };

const UPDATE_PRODUCT_IMAGE_MUTATION = `#graphql
  mutation UpdateProductImageAlt($productId: ID!, $image: ImageInput!) {
    productImageUpdate(productId: $productId, image: $image) {
      image { id altText }
      userErrors { field message }
    }
  }
`;

const UPDATE_FILE_ALT_MUTATION = `#graphql
  mutation UpdateFileAlt($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      userErrors { field message }
    }
  }
`;

export async function updateProductImageAltText(
  admin: AdminClient,
  productId: string,
  imageId: string,
  altText: string,
): Promise<MutationResult> {
  const response = await admin.graphql(UPDATE_PRODUCT_IMAGE_MUTATION, {
    variables: { productId, image: { id: imageId, altText } },
  });
  const { data } = await response.json();
  const userErrors = data?.productImageUpdate?.userErrors ?? [];
  return { succeeded: userErrors.length === 0, userErrors };
}

export async function updateFileAltText(
  admin: AdminClient,
  fileId: string,
  altText: string,
): Promise<MutationResult> {
  const response = await admin.graphql(UPDATE_FILE_ALT_MUTATION, {
    variables: { files: [{ id: fileId, alt: altText }] },
  });
  const { data } = await response.json();
  const userErrors = data?.fileUpdate?.userErrors ?? [];
  return { succeeded: userErrors.length === 0, userErrors };
}
