import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>PixelAlt AI</h1>
        <p className={styles.text}>
          AI-generated image alt text for your Shopify catalog — better SEO, better accessibility, in seconds.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>AI alt text</strong>. Generate accurate, on-brand alt text for every product image.
          </li>
          <li>
            <strong>Bulk processing</strong>. Sync your whole catalog and generate in batches.
          </li>
          <li>
            <strong>Automation</strong>. Auto-generate alt text for new products as they&apos;re added.
          </li>
        </ul>
      </div>
    </div>
  );
}
