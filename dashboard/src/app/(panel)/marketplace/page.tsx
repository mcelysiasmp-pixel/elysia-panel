"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store } from "lucide-react";

interface MarketplaceItem {
  id: string;
  type: string;
  name: string;
  description: string | null;
  authorName: string;
  priceCents: number;
  verified: boolean;
  downloads: number;
}

export default function MarketplacePage() {
  const itemsQuery = useQuery({
    queryKey: ["marketplace-items"],
    queryFn: () => api.get<MarketplaceItem[]>("/marketplace/items"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
        <p className="text-sm text-muted-foreground">Plugins panel, thèmes, templates et images Docker de la communauté.</p>
      </div>

      {itemsQuery.data?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Store className="size-8" />
            <p>Le marketplace est vide pour le moment.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {itemsQuery.data?.map((item) => (
          <Card key={item.id}>
            <CardHeader className="flex-row items-start justify-between gap-2">
              <CardTitle className="text-base">{item.name}</CardTitle>
              {item.verified && <Badge>Vérifié</Badge>}
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
              <p className="line-clamp-2">{item.description}</p>
              <span>Par {item.authorName}</span>
              <div className="flex items-center justify-between pt-1">
                <Badge variant="outline">{item.type}</Badge>
                <span>{item.priceCents === 0 ? "Gratuit" : `${(item.priceCents / 100).toFixed(2)} EUR`}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
