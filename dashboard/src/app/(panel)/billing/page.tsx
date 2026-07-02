"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Invoice {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  plans: { id: string; name: string; priceCents: number; currency: string; billingCycle: string }[];
}

export default function BillingPage() {
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: () => api.get<Invoice[]>("/billing/invoices") });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => api.get<Product[]>("/billing/products") });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facturation</h1>
        <p className="text-sm text-muted-foreground">Plans disponibles et historique de facturation.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {productsQuery.data?.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="text-base">{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{p.description}</p>
              {p.plans.map((plan) => (
                <div key={plan.id} className="flex justify-between text-sm">
                  <span>{plan.name}</span>
                  <span className="font-medium">
                    {(plan.priceCents / 100).toFixed(2)} {plan.currency} / {plan.billingCycle.toLowerCase()}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        {productsQuery.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun produit configuré pour le moment.</p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Mes factures</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numéro</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoicesQuery.data?.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                <TableCell>
                  <Badge variant={inv.status === "PAID" ? "outline" : "secondary"}>{inv.status}</Badge>
                </TableCell>
                <TableCell>
                  {(inv.totalCents / 100).toFixed(2)} {inv.currency}
                </TableCell>
                <TableCell>{new Date(inv.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
