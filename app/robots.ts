import type { MetadataRoute } from "next";
import { canIndexPublicPages, publicUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard/"] },
    ...(canIndexPublicPages() ? { sitemap: publicUrl("/sitemap.xml") } : {}),
  };
}
