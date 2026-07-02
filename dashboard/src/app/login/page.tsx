"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await login(email, password, totpCode || undefined);
      if (result.requiresTwoFactor) {
        setNeedsTwoFactor(true);
        toast.info("Entrez votre code d'authentification à deux facteurs");
      } else {
        toast.success("Connexion réussie");
        router.push("/servers");
      }
    } catch {
      toast.error("Identifiants invalides");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Elysia Panel</CardTitle>
            <CardDescription>Connectez-vous à votre panel d&apos;hébergement</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {needsTwoFactor && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="totp">Code 2FA</Label>
                  <Input id="totp" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} autoFocus />
                </div>
              )}
              <Button type="submit" disabled={submitting} className="mt-2">
                {submitting ? "Connexion..." : "Se connecter"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Pas de compte ?{" "}
              <Link href="/register" className="underline underline-offset-4">
                Créer un compte
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
