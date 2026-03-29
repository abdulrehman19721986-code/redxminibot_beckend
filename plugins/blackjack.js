/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

class Blackjack {
    constructor(playerId, bet = 10) {
        this.playerId = playerId;
        this.bet = bet;
        this.deck = this.createDeck();
        this.playerHand = [];
        this.dealerHand = [];
        this.playerScore = 0;
        this.dealerScore = 0;
        this.gameOver = false;
        this.result = null;
        this.balance = 100; // starting balance
    }

    createDeck() {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
        const deck = [];
        for (let s of suits) {
            for (let v of values) {
                deck.push({ value: v, suit: s });
            }
        }
        return this.shuffle(deck);
    }

    shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    deal() {
        this.playerHand = [this.deck.pop(), this.deck.pop()];
        this.dealerHand = [this.deck.pop(), this.deck.pop()];
        this.calculateScores();
    }

    calculateScores() {
        this.playerScore = this.handValue(this.playerHand);
        this.dealerScore = this.handValue(this.dealerHand);
    }

    handValue(hand) {
        let value = 0;
        let aces = 0;
        for (let card of hand) {
            if (card.value === 'A') {
                aces++;
                value += 11;
            } else if (['K','Q','J'].includes(card.value)) {
                value += 10;
            } else {
                value += parseInt(card.value);
            }
        }
        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }
        return value;
    }

    hit() {
        if (this.gameOver) return false;
        this.playerHand.push(this.deck.pop());
        this.playerScore = this.handValue(this.playerHand);
        if (this.playerScore > 21) {
            this.gameOver = true;
            this.result = 'bust';
            this.balance -= this.bet;
        }
        return true;
    }

    stand() {
        if (this.gameOver) return false;
        while (this.dealerScore < 17) {
            this.dealerHand.push(this.deck.pop());
            this.dealerScore = this.handValue(this.dealerHand);
        }
        this.gameOver = true;
        if (this.dealerScore > 21 || this.playerScore > this.dealerScore) {
            this.result = 'win';
            this.balance += this.bet;
        } else if (this.playerScore === this.dealerScore) {
            this.result = 'push';
        } else {
            this.result = 'lose';
            this.balance -= this.bet;
        }
    }

    getDisplayBoard(hideDealer = true) {
        const cardToEmoji = (card) => {
            const suitEmoji = { '♠':'♠️', '♥':'♥️', '♦':'♦️', '♣':'♣️' };
            return `${card.value}${suitEmoji[card.suit]}`;
        };

        let playerCards = this.playerHand.map(cardToEmoji).join(' ');
        let dealerCards = hideDealer && !this.gameOver
            ? `${cardToEmoji(this.dealerHand[0])} 🂠`
            : this.dealerHand.map(cardToEmoji).join(' ');

        let status = '';
        if (this.gameOver) {
            if (this.result === 'win') status = '🎉 *You Win!*';
            else if (this.result === 'lose') status = '💔 *You Lose!*';
            else if (this.result === 'push') status = '🤝 *Push*';
            else if (this.result === 'bust') status = '💥 *Bust!*';
        } else {
            status = 'Hit or Stand?';
        }

        return `🃏 *BLACKJACK* 🃏\n\n` +
               `Dealer: ${dealerCards} (${hideDealer && !this.gameOver ? '?' : this.dealerScore})\n` +
               `Player: ${playerCards} (${this.playerScore})\n\n` +
               `Balance: 💰 ${this.balance}  |  Bet: ${this.bet}\n\n` +
               status;
    }
}

const games = new Map(); // key = chatId:playerId

module.exports = {
    command: 'blackjack',
    aliases: ['bj'],
    category: 'games',
    description: 'Play Blackjack against the dealer.',
    usage: 
        '.bj start <bet>             – Start a new game with bet\n' +
        '.bj hit                       – Take another card\n' +
        '.bj stand                     – Stop and let dealer play\n' +
        '.bj guide                      – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text) => 
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `🃏 *Blackjack Commands*\n\n` +
                `• \`.bj start <bet>\` – New game (bet 10-100)\n` +
                `• \`.bj hit\` – Draw card\n` +
                `• \`.bj stand\` – Stop\n` +
                `• \`.bj guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();
        const gameKey = `${chatId}:${senderId}`;
        let game = games.get(gameKey);

        if (subCmd === 'guide') {
            return await reply(
                `📖 *Blackjack Guide*\n\n` +
                `1. Start a game with a bet: \`.bj start 20\`\n` +
                `2. You get two cards, dealer shows one\n` +
                `3. Aim to get as close to 21 without going over\n` +
                `4. Hit to take another card\n` +
                `5. Stand to let dealer play\n` +
                `6. Dealer must hit on 16 and stand on 17\n` +
                `7. Win if you beat dealer, lose if bust\n` +
                `8. Blackjack (21 with two cards) pays 2x`
            );
        }

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            const bet = args.length > 1 ? parseInt(args[1]) : 10;
            if (isNaN(bet) || bet < 10 || bet > 100) return await reply('❌ Bet must be 10-100.');
            game = new Blackjack(senderId, bet);
            game.deal();
            games.set(gameKey, game);
            return await reply(game.getDisplayBoard());
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.bj start <bet>`');

        if (subCmd === 'hit') {
            game.hit();
            if (game.gameOver) {
                await reply(game.getDisplayBoard(false));
                games.delete(gameKey);
            } else {
                await reply(game.getDisplayBoard());
            }
            return;
        }

        if (subCmd === 'stand') {
            game.stand();
            await reply(game.getDisplayBoard(false));
            games.delete(gameKey);
            return;
        }

        await reply('❌ Unknown subcommand. Use `.bj guide` for help.');
    }
};
