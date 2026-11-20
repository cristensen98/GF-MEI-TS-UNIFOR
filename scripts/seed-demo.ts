import { Ledger } from '../src/domain/ledger.ts';
import { SqliteRepository } from '../src/server/sqlite.ts';

const database = new SqliteRepository('data/gfmei.sqlite');
const ledger = new Ledger(database);

const services = [
    ['Identidade visual para cafeteria', 'Cafeteria Aurora', 280000, '2026-06-03'],
    ['Manutenção de computadores', 'Escritório Lima', 95000, '2026-06-10'],
    ['Landing page promocional', 'Studio Movimento', 180000, '2026-06-18'],
    ['Catálogo digital de produtos', 'Artesanato Raízes', 145000, '2026-07-02'],
    ['Configuração de rede local', 'Clínica Sorriso', 120000, '2026-07-11'],
    ['Gestão mensal de redes sociais', 'Mercado Bom Vizinho', 90000, '2026-07-20'],
    ['Site institucional', 'Oliveira Advocacia', 320000, '2026-08-04'],
    ['Ensaio fotográfico de produtos', 'Doce Encanto', 110000, '2026-08-13'],
    ['Automação de planilhas', 'Construtora Horizonte', 175000, '2026-08-22'],
    ['Loja virtual básica', 'Moda Circular', 350000, '2026-09-01'],
    ['Suporte técnico mensal', 'Pousada Mar Azul', 85000, '2026-09-12'],
    ['Material gráfico para evento', 'Instituto Aprender', 130000, '2026-09-19'],
    ['Sistema de agendamento', 'Espaço Bela', 290000, '2026-10-03'],
    ['Treinamento de ferramentas digitais', 'Associação Nova Vida', 160000, '2026-10-14'],
    ['Atualização de site institucional', 'Engenharia Martins', 125000, '2026-10-23'],
    ['Campanha de fim de ano', 'Empório Central', 210000, '2026-11-04'],
    ['Manutenção preventiva', 'Contabilidade Exata', 105000, '2026-11-10'],
    ['Cardápio digital com QR Code', 'Bistrô da Praça', 135000, '2026-11-17']
] as const;

const operatingExpenses = [
    ['Internet empresarial', 'Internet e telefone', 12990, '2026-06-08'],
    ['Assinatura de software', 'Software', 8900, '2026-06-12'],
    ['DAS MEI', 'Impostos', 8190, '2026-06-20'],
    ['Internet empresarial', 'Internet e telefone', 12990, '2026-07-08'],
    ['Assinatura de software', 'Software', 8900, '2026-07-12'],
    ['DAS MEI', 'Impostos', 8190, '2026-07-20'],
    ['Internet empresarial', 'Internet e telefone', 12990, '2026-08-08'],
    ['Assinatura de software', 'Software', 8900, '2026-08-12'],
    ['DAS MEI', 'Impostos', 8190, '2026-08-20'],
    ['Internet empresarial', 'Internet e telefone', 12990, '2026-09-08'],
    ['Assinatura de software', 'Software', 8900, '2026-09-12'],
    ['DAS MEI', 'Impostos', 8190, '2026-09-20'],
    ['Internet empresarial', 'Internet e telefone', 12990, '2026-10-08'],
    ['Assinatura de software', 'Software', 8900, '2026-10-12'],
    ['DAS MEI', 'Impostos', 8190, '2026-10-20'],
    ['Internet empresarial', 'Internet e telefone', 12990, '2026-11-08'],
    ['Assinatura de software', 'Software', 8900, '2026-11-12'],
    ['DAS MEI', 'Impostos', 8190, '2026-11-18']
] as const;

function addDays(date: string, days: number) {
    const value = new Date(date + 'T00:00:00Z');
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

try {
    const existing = ['servicos', 'despesas', 'recebimentos'] as const;
    if (existing.some(kind => ledger.list(kind).length > 0)) {
        throw new Error('O banco já contém lançamentos. A carga de demonstração não foi aplicada.');
    }

    for (const [index, [descricao, cliente, valor, data]] of services.entries()) {
        const service = ledger.save('servicos', {
            descricao, detalhe: cliente, valor, data, servico: null, pagamento: null
        });

        const directCost = Math.round(valor * (0.12 + (index % 4) * 0.025));
        const expenseDate = addDays(data, 2);
        ledger.save('despesas', {
            descricao: index % 2 === 0 ? 'Materiais e recursos do projeto' : 'Serviço terceirizado',
            detalhe: index % 2 === 0 ? 'Insumos' : 'Terceirização',
            valor: directCost,
            data: expenseDate,
            servico: service.id,
            pagamento: expenseDate
        });

        if (index % 3 === 0) {
            const firstPart = Math.round(valor * 0.4);
            ledger.save('recebimentos', {
                descricao: 'Entrada do serviço', detalhe: null, valor: firstPart,
                data: addDays(data, 1), servico: service.id, pagamento: null
            });
            ledger.save('recebimentos', {
                descricao: 'Pagamento final', detalhe: null, valor: valor - firstPart,
                data: addDays(data, 12), servico: service.id, pagamento: null
            });
        } else if (index % 3 === 1) {
            ledger.save('recebimentos', {
                descricao: 'Pagamento parcial', detalhe: null, valor: Math.round(valor * 0.5),
                data: addDays(data, 5), servico: service.id, pagamento: null
            });
        }
    }

    for (const [descricao, categoria, valor, data] of operatingExpenses) {
        ledger.save('despesas', {
            descricao, detalhe: categoria, valor, data, servico: null, pagamento: data
        });
    }

    const cancelledExpense = ledger.save('despesas', {
        descricao: 'Compra lançada em duplicidade', detalhe: 'Material de escritório', valor: 15900,
        data: '2026-09-16', servico: null, pagamento: '2026-09-16'
    });
    ledger.cancel('despesas', cancelledExpense.id);

    const cancelledService = ledger.save('servicos', {
        descricao: 'Projeto cancelado pelo cliente', detalhe: 'Loja Primavera', valor: 150000,
        data: '2026-10-28', servico: null, pagamento: null
    });
    ledger.cancel('servicos', cancelledService.id);

    console.log('Carga concluída: 19 serviços, 37 despesas e 18 recebimentos.');
} finally {
    database.close();
}
