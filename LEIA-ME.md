# Registro de Emoções

App para registrar situações, pensamentos automáticos, emoções e comportamentos, organizados por dia, com exportação em PDF.

Ele funciona como um app instalado no celular, mas é feito com tecnologia web (PWA). Para instalar, ele precisa estar publicado em um endereço **https**. Abrir o arquivo `index.html` direto no aparelho não permite instalar nem usar offline.

## 1. Publicar o app (uma vez só)

### Opção rápida: Netlify Drop (sem conta técnica)
1. Descompacte o `.zip` no computador.
2. Acesse https://app.netlify.com/drop
3. Arraste a pasta `emocoes-app` para a página.
4. Em alguns segundos você recebe um endereço como `https://nome-aleatorio.netlify.app`. Esse é o endereço do seu app.

### Opção GitHub Pages
1. Crie uma conta gratuita em https://github.com e um repositório novo, **público**.
2. Clique em **Add file → Upload files** e envie todos os arquivos e pastas do app.
3. Vá em **Settings → Pages → Source: Deploy from a branch**, escolha a branch `main` e a pasta `/ (root)`.
4. Espere 1 ou 2 minutos. O app ficará em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## 2. Instalar no celular

**Android**
1. Abra o endereço no **Chrome**.
2. Toque no menu ⋮ e em **Instalar app** (ou **Adicionar à tela inicial**).
3. O ícone aparece na tela inicial. O app abre em tela cheia e funciona sem internet depois do primeiro acesso.

**iPhone**
1. Abra o endereço no **Safari**. Outros navegadores no iPhone não conseguem instalar.
2. Toque no ícone de compartilhar (quadrado com seta).
3. Escolha **Adicionar à Tela de Início** e toque em **Adicionar**.

## 3. Como usar

- **Navegar entre os dias:** toque nas setas `<` `>` ou arraste para o lado sobre o nome do dia da semana.
- **Ir para outra data:** toque no nome do dia e escolha no calendário. Os dias com registros aparecem com um ponto.
- **Novo registro:** botão **+** no canto inferior direito. Toque em um card para editar ou excluir.
- **Exportar:** botão **Exportar** no topo. Escolha o período no calendário (ou marque "Exportar todos os dados já criados") e depois **Baixar PDF** ou **Compartilhar PDF**. O PDF traz só os dias com registros, com a data acima da tabela de cada dia.
- **Lembrete das quartas:** nas quartas-feiras (e depois, se você ainda não exportou), aparece um aviso no topo. O botão **Lembrar na próxima quarta** adia o aviso até lá. Se você apenas fechar o aviso com o **X**, ele volta na próxima vez que abrir o app.
- **Rascunho automático:** se você fechar o app no meio de um registro, o texto é recuperado quando abrir de novo.

## 4. Importante sobre seus dados

- Os dados ficam **somente no navegador deste aparelho**. Não há sincronização entre aparelhos.
- Limpar os dados do navegador ou desinstalar o app **apaga os registros**.
- **iPhone:** o Safari pode apagar os dados de apps que ficam cerca de 7 dias sem serem abertos. Abra o app com frequência e exporte o PDF toda semana, como o lembrete sugere.
- **Emojis e símbolos especiais** aparecem normalmente no app, mas **não são incluídos no PDF**, porque o PDF usa uma fonte padrão. O texto em português, com acentos, sai normalmente.

## 5. Atualizar o app depois

Se você alterar qualquer arquivo, abra `sw.js` e aumente o número em `CACHE_NAME` (por exemplo, `emocoes-v1` para `emocoes-v2`) antes de publicar de novo. Assim os aparelhos recebem a versão nova em vez da guardada.
