const saoPauloDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });

export function businessDate(date = new Date()) {
    return saoPauloDate.format(date);
}
