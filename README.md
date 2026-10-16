# Despesas

Gestor de despesas pessoais, em português, para uma pessoa. Corre como site estático (GitHub Pages). Os dados ficam num gist privado, cifrados com a tua palavra-passe. Não há base de dados nem servidor.

Inclui movimentos, contas, categorias, orçamentos, recorrentes, metas de poupança e uma secção de crédito habitação e crédito obras (mapa francês, Euribor, carência, desembolsos e simulador de amortização antecipada).

## O que precisas

1. Um repositório GitHub com este projeto. O site publicado é público; a palavra-passe é que o fecha. Com GitHub Pro podes manter o repositório privado.
2. Um gist **secreto** com um ficheiro chamado `data.enc` e o conteúdo `{}`. O id do gist é o final do URL (`gist.github.com/o-teu-user/`**`abc123`**).
3. Um token clássico do GitHub só com o âmbito `gist` (os tokens fine-grained não servem para gists). [Criar token](https://github.com/settings/tokens/new?scopes=gist&description=despesas).

Usa uma palavra-passe longa. Quem a tiver lê e escreve os dados. Mudar a palavra-passe mais tarde deixa de conseguir abrir o gist antigo: exporta um backup em Definições antes.

## No teu computador

```bash
cp .env.example .env.local
```

Preenche `APP_PASSWORD`, `GIST_TOKEN` e `GIST_ID`.

```bash
npm install
npm run dev
```

## No GitHub Pages

No repositório: Settings → Secrets and variables → Actions, cria:

- `APP_PASSWORD`
- `GIST_TOKEN`
- `GIST_ID`

Settings → Pages → Build and deployment → Source: **GitHub Actions**.

Faz push para `main`. A Action corre os testes, cifra o token dentro do site e publica. No telemóvel abre o URL, entra com a mesma palavra-passe e, se quiseres, Adicionar ao ecrã principal.

A sessão fica no dispositivo até carregares em Sair. Se editares no computador e no telemóvel ao mesmo tempo, a app avisa antes de substituir a versão mais recente.
