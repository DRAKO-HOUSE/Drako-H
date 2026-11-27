# Guia de Configuração e Testes - Notificações Web Push (FCM + PWA)

Este guia orienta a configuração completa do sistema de notificações em segundo plano para o **DRAKO HOUSE**, sem custos (utilizando o plano gratuito Spark do Firebase + Serverless da Vercel).

---

## 1. Passo a Passo de Configuração

### 1.1 Gerar Par de Chaves VAPID (Web Push Certificate)
1. Acesse o [Firebase Console](https://console.firebase.google.com/) e selecione o projeto `drako-house`.
2. Vá em **Configurações do Projeto** (ícone de engrenagem) > aba **Cloud Messaging**.
3. Na seção **Web configuration** (Certificados push da Web), clique em **Generate key pair** (Gerar par de chaves).
4. Copie a chave pública gerada.
5. Abra o arquivo `push.js` e substitua `'SUA_CHAVE_PUBLICA_VAPID_AQUI'` pela sua chave pública copiada.

### 1.2 Gerar Chave de Conta de Serviço (Firebase Admin SDK)
1. No [Firebase Console](https://console.firebase.google.com/), acesse **Configurações do Projeto** > aba **Contas de serviço**.
2. Clique no botão **Gerar nova chave privada** e confirme. O download de um arquivo `.json` será iniciado.
3. Abra esse arquivo `.json` baixado em um editor de texto e copie todo o seu conteúdo (formato JSON em linha única ou formatado).

### 1.3 Configurar Variáveis de Ambiente na Vercel
1. Acesse o painel do seu projeto na [Vercel](https://vercel.com/) referente ao `drako-house`.
2. Acesse **Settings** > **Environment Variables**.
3. Adicione as duas variáveis de ambiente:
   - **`FIREBASE_SERVICE_ACCOUNT`**: Cole todo o conteúdo JSON da chave privada copiada no passo 1.2.
   - **`FIREBASE_DATABASE_URL`**: `https://drako-house-default-rtdb.firebaseio.com`
4. Marque os ambientes: **Production**, **Preview** e **Development**. Salve.

### 1.4 Publicar as Regras do Realtime Database
1. No Firebase Console, acesse **Realtime Database** > aba **Regras**.
2. Cole o conteúdo de [database.rules.json](file:///home/anderson/Área%20de%20trabalho/Nova%20pasta%201/Drako-H/database.rules.json) completo e clique em **Publicar**.

### 1.5 Ícones do PWA
Adicione os ícones nos tamanhos especificados na pasta `assets/`:
- `assets/icon-192.png` (192x192 px)
- `assets/icon-512.png` (512x512 px)
*(Você pode exportar a partir da logo já existente em `assets/logo.jpeg`).*

### 1.6 Deploy
Faça o commit e push para o repositório GitHub conectado à Vercel:
```bash
git add .
git commit -m "feat: suporte a PWA e notificacoes push de pedidos"
git push origin main
```
Após o deploy, certifique-se de que a Vercel instalou `firebase-admin` via `package.json`.

---

## 2. Instalação do PWA e Configuração do Aparelho do Dono

### 2.1 Android (Google Chrome)
1. Acesse `https://drako-house.vercel.app/admin.html` no Chrome.
2. Faça login com a conta de administrador.
3. No menu do Chrome (três pontinhos), toque em **Instalar aplicativo** (ou **Adicionar à tela inicial**).
4. Abra o aplicativo pelo atalho criado na tela inicial.
5. Toque no botão **"🔔 Ativar Notificações"** no topo e confirme a permissão do sistema operacional.
6. O botão passará a exibir **"🔔 Notificações Ativas"**.

### 2.2 Otimização de Bateria no Android (Essencial para receber com tela apagada)
Para garantir que o Android não suspenda o Service Worker quando o celular estiver ocioso:
1. Vá nas **Configurações do Android** > **Aplicativos** > procure por **Drako Admin** (ou **Chrome**, caso não tenha instalado o PWA).
2. Toque em **Bateria** (ou **Uso da bateria**).
3. Altere de *Otimizado* para **Irrestrito** (ou desative *Otimização de Bateria*).
4. Certifique-se de que **Permitir dados em segundo plano** está ativado em **Uso de dados**.

### 2.3 iOS 16.4+ (iPhone / iPad)
1. Abra `https://drako-house.vercel.app/admin.html` no Safari.
2. Toque no botão **Compartilhar** (quadrado com seta para cima) > **Adicionar à Tela de Início**.
3. **Obrigatório:** Abra o aplicativo instalado diretamente pelo ícone na Tela de Início (o Web Push no iOS só funciona no modo standalone).
4. Faça login e toque no botão **"🔔 Ativar Notificações"**, aceitando o diálogo do iOS.

---

## 3. Roteiro de Testes Baseado nos Critérios de Aceite

| # | Teste | Procedimento | Resultado Esperado |
|---|---|---|---|
| 1 | **Push com tela bloqueada** | Faça um pedido no cardápio `index.html`. Bloqueie o celular do dono. | Em poucos segundos o celular vibra e a notificação surge na tela com o nome do cliente e total. |
| 2 | **Redirecionamento ao tocar** | Toque na notificação recebida no celular. | Abre o aplicativo PWA direto na aba **Pedidos**. |
| 3 | **Idempotência de notificação** | Chame a API com o mesmo `pedidoId` duas vezes seguidas: `curl -X POST https://drako-house.vercel.app/api/notificar -H "Content-Type: application/json" -d '{"pedidoId":"ID_EXISTENTE"}'` | 1ª chamada responde `200` (`sucesso: true`). 2ª chamada responde `200` com `jaNotificado: true` e nenhuma notificação extra é enviada. |
| 4 | **Validação de ID inválido** | Envie um ID fora do padrão (ex: `{"pedidoId":"abc"}`). | Retorna status **400** com mensagem amigável. |
| 5 | **Pedido inexistente** | Envie um ID válido que não existe no banco (ex: `{"pedidoId":"-Nzx9999999999999999"}`). | Retorna status **404** ("Pedido não encontrado"). |
| 6 | **Método incorreto** | Faça uma requisição `GET` para `/api/notificar`. | Retorna status **405** com cabeçalho `Allow: POST, OPTIONS`. |
| 7 | **Limpeza de tokens expirados** | Adicione manualmente um token falso em `adminTokens/{uid}/token_invalido` e realize um pedido. | O envio falha para o token inválido e o servidor remove automaticamente a entrada no banco. |
| 8 | **Resiliência do Checkout** | Desative o Wi-Fi/4G logo após o pedido ou aponte temporariamente a URL para uma rota inexistente. | O pedido abre normalmente a janela do WhatsApp e não trava o cliente. |
| 9 | **Segurança de regras** | Tente ler `adminTokens` ou escrever em `pedidos/{id}/notificado` sem estar logado. | Leitura/escrita rejeitada com `PERMISSION_DENIED`. |
| 10 | **Instalação do PWA** | Abra o painel no navegador móvel. | Banner/opção de instalação disponível; ao abrir exibe sem barra de endereço do navegador (`display: standalone`). |
