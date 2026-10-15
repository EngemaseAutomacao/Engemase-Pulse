-- Cor padrão da marca: de turquesa para o azul da Engemase.
ALTER TABLE "tenants" ALTER COLUMN "primary_color" SET DEFAULT '#4a9ee0';

-- Clientes que ficaram com o turquesa padrão (nunca escolheram cor) acompanham a mudança.
UPDATE "tenants" SET "primary_color" = '#4a9ee0' WHERE lower("primary_color") = '#5cbdb9';
