/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

class Battleship {
    constructor(player1, player2) {
        this.players = [player1, player2];
        this.boards = [
            this.createEmptyBoard(),
            this.createEmptyBoard()
        ];
        this.ships = [
            this.placeShips(),
            this.placeShips()
        ];
        this.turn = 0; // index of current player
        this.gameOver = false;
        this.winner = null;
    }

    createEmptyBoard() {
        return Array(8).fill().map(() => Array(8).fill('🌊'));
    }

    placeShips() {
        const ships = [];
        const sizes = [5,4,3,3,2]; // ship sizes
        for (let size of sizes) {
            let placed = false;
            for (let attempt = 0; attempt < 100; attempt++) {
                const horizontal = Math.random() < 0.5;
                const r = Math.floor(Math.random() * 8);
                const c = Math.floor(Math.random() * 8);
                if (horizontal && c + size > 8) continue;
                if (!horizontal && r + size > 8) continue;
                
                // Check if cells are free
                let conflict = false;
                for (let i = 0; i < size; i++) {
                    const nr = horizontal ? r : r + i;
                    const nc = horizontal ? c + i : c;
                    if (ships.some(s => s.r === nr && s.c === nc)) {
                        conflict = true;
                        break;
                    }
                }
                if (conflict) continue;
                
                // Place ship
                for (let i = 0; i < size; i++) {
                    const nr = horizontal ? r : r + i;
                    const nc = horizontal ? c + i : c;
                    ships.push({ r: nr, c: nc });
                }
                placed = true;
                break;
            }
            if (!placed) {
                // fallback - just place somewhere
                for (let i = 0; i < size; i++) {
                    ships.push({ r: i, c: i });
                }
            }
        }
        return ships;
    }

    attack(playerIndex, r, c) {
        if (this.gameOver) return { error: 'Game already ended' };
        if (playerIndex !== this.turn) return { error: 'Not your turn' };
        
        const opponent = 1 - playerIndex;
        const board = this.boards[opponent];
        const ships = this.ships[opponent];
        
        if (board[r][c] !== '🌊') return { error: 'Already targeted' };
        
        const hit = ships.some(s => s.r === r && s.c === c);
        board[r][c] = hit ? '💥' : '⬜';
        
        // Check if all ships sunk
        const allSunk = ships.every(s => board[s.r][s.c] === '💥');
        if (allSunk) {
            this.gameOver = true;
            this.winner = this.players[playerIndex];
        }
        
        this.turn = opponent;
        return { hit, gameOver: this.gameOver };
    }

    getDisplayBoard(playerIndex) {
        const board = this.boards[playerIndex];
        const opponentBoard = this.boards[1 - playerIndex];
        
        let yourBoard = '🚢 *YOUR BOARD*\n   ';
        for (let c = 0; c < 8; c++) yourBoard += (c+1) + ' ';
        yourBoard += '\n';
        for (let r = 0; r < 8; r++) {
            yourBoard += (r+1).toString().padStart(2) + ' ';
            for (let c = 0; c < 8; c++) {
                const isShip = this.ships[playerIndex].some(s => s.r === r && s.c === c);
                yourBoard += (isShip && board[r][c] === '🌊') ? '🚢' : board[r][c];
                yourBoard += ' ';
            }
            yourBoard += '\n';
        }
        
        let enemyBoard = '🎯 *ENEMY BOARD*\n   ';
        for (let c = 0; c < 8; c++) enemyBoard += (c+1) + ' ';
        enemyBoard += '\n';
        for (let r = 0; r < 8; r++) {
            enemyBoard += (r+1).toString().padStart(2) + ' ';
            for (let c = 0; c < 8; c++) {
                enemyBoard += opponentBoard[r][c] + ' ';
            }
            enemyBoard += '\n';
        }
        
        let status = `\nTurn: ${this.players[this.turn] === this.players[playerIndex] ? 'YOUR' : 'OPPONENT'}'s turn`;
        if (this.gameOver) status = `\n🏆 *${this.winner} wins!* 🏆`;
        
        return yourBoard + '\n' + enemyBoard + status;
    }
}

const games = new Map(); // key = chatId

module.exports = {
    command: 'battleship',
    aliases: ['bs'],
    category: 'games',
    description: 'Classic battleship game for two players.',
    usage: 
        '.bs start                   – Start a new game (you host)\n' +
        '.bs join                     – Join waiting game\n' +
        '.bs attack <row> <col>       – Attack coordinates (1-8)\n' +
        '.bs guide                      – Show game guide',
    groupOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const senderName = message.pushName || senderId.split('@')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text, mentions = []) => 
            await sock.sendMessage(chatId, { text, mentions, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `🚢 *Battleship Commands*\n\n` +
                `• \`.bs start\` – Host a game\n` +
                `• \`.bs join\` – Join waiting game\n` +
                `• \`.bs attack <row> <col>\` – Fire! (1-8)\n` +
                `• \`.bs guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();

        if (subCmd === 'guide') {
            return await reply(
                `📖 *Battleship Guide*\n\n` +
                `1. Host starts a game: \`.bs start\`\n` +
                `2. Opponent joins: \`.bs join\`\n` +
                `3. Take turns attacking with \`.bs attack <row> <col>\` (1-8)\n` +
                `4. 💥 = hit, ⬜ = miss, 🌊 = unknown\n` +
                `5. Sink all enemy ships to win!\n` +
                `6. Your own board shows 🚢 for your ships.`
            );
        }

        let game = games.get(chatId);

        if (subCmd === 'start') {
            if (game) games.delete(chatId);
            game = { players: [senderId], stage: 'waiting' };
            games.set(chatId, game);
            return await reply(
                `🚢 *Battleship Game Created!*\n\n` +
                `Host: @${senderName}\n` +
                `Waiting for opponent to join with \`.bs join\``,
                [senderId]
            );
        }

        if (subCmd === 'join') {
            if (!game || game.stage !== 'waiting') return await reply('❌ No game waiting to join.');
            if (game.players.includes(senderId)) return await reply('❌ You are already in the game.');
            game.players.push(senderId);
            game.stage = 'playing';
            game.bsGame = new Battleship(game.players[0], game.players[1]);
            await reply(
                `✅ Game started!\n\n` +
                game.bsGame.getDisplayBoard(0), // show player 0's view
                game.players
            );
            return;
        }

        if (!game || game.stage !== 'playing') return await reply('❌ No game in progress.');

        const playerIndex = game.players.indexOf(senderId);
        if (playerIndex === -1) return await reply('❌ You are not in this game.');

        if (subCmd === 'attack') {
            if (args.length < 3) return await reply('❌ Usage: `.bs attack <row> <col>`');
            const row = parseInt(args[1]) - 1;
            const col = parseInt(args[2]) - 1;
            if (isNaN(row) || isNaN(col) || row < 0 || row >= 8 || col < 0 || col >= 8) {
                return await reply('❌ Coordinates must be 1-8.');
            }

            const result = game.bsGame.attack(playerIndex, row, col);
            if (result.error) return await reply(`❌ ${result.error}`);

            // Show result to both players
            const boardPlayer0 = game.bsGame.getDisplayBoard(0);
            const boardPlayer1 = game.bsGame.getDisplayBoard(1);
            
            if (result.gameOver) {
                await sock.sendMessage(chatId, { text: boardPlayer0, ...channelInfo });
                await sock.sendMessage(chatId, { text: boardPlayer1, ...channelInfo });
                games.delete(chatId);
            } else {
                // Send appropriate board to each player (optional, but we can just send both)
                await sock.sendMessage(chatId, { text: boardPlayer0, ...channelInfo });
                await sock.sendMessage(chatId, { text: boardPlayer1, ...channelInfo });
            }
            return;
        }

        await reply('❌ Unknown subcommand. Use `.bs guide` for help.');
    }
};
