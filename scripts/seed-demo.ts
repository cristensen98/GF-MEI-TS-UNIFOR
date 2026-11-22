import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { businessDate } from '../src/domain/calendar.ts';
import { Ledger } from '../src/domain/ledger.ts';
import { meiThresholds, recordedRevenue } from '../src/domain/mei-revenue.ts';
import { serviceTotal } from '../src/domain/model.ts';
import { SqliteRepository } from '../src/server/sqlite.ts';

type PaymentPlan = 'full' | 'split' | 'partial' | 'open';

interface ServiceSeed {
    descricao: string;
    cliente: string;
    valor: number;
    data: string;
    pagamento: PaymentPlan;
    custoMaterial?: number;
    despesaDireta?: { descricao: string; categoria: 'Insumos' | 'Terceirização'; percentual: number };
}

const year = Number(businessDate().slice(0, 4));
const thresholds = meiThresholds(year);
const ceiling = thresholds?.ceiling ?? 8_100_000;
const scaleAmount = (cents: number) => ceiling === 8_100_000
    ? cents
    : Math.max(5000, Math.round((cents * ceiling / 8_100_000) / 5000) * 5000);
const dateInYear = (monthDay: string) => `${year}-${monthDay}`;

// Total acumulado de janeiro a novembro em 2026: R$ 77.800,00 (96,05% do teto anual de R$ 81.000,00),
// deixando R$ 3.200,00 de margem para que lançamentos em dezembro demonstrem a aproximação e ultrapassagem do limite.
const services: readonly ServiceSeed[] = [
    // Janeiro — R$ 5.850,00
    {
        descricao: 'Manutenção preventiva de estações', cliente: 'Escritório Lima',
        valor: 115000, data: '01-06', pagamento: 'full'
    },
    {
        descricao: 'Site institucional responsivo', cliente: 'Clínica Bem Estar',
        valor: 320000, data: '01-14', pagamento: 'split',
        despesaDireta: { descricao: 'Template e licenças de plug-ins', categoria: 'Insumos', percentual: 0.14 }
    },
    {
        descricao: 'Configuração de backup em nuvem', cliente: 'Contabilidade Exata',
        valor: 150000, data: '01-23', pagamento: 'full'
    },

    // Fevereiro — R$ 6.350,00
    {
        descricao: 'Identidade visual completa', cliente: 'Cafeteria Aurora',
        valor: 290000, data: '02-04', pagamento: 'split',
        despesaDireta: { descricao: 'Ilustrações e acabamento gráfico', categoria: 'Terceirização', percentual: 0.16 }
    },
    {
        descricao: 'Instalação e cabeamento de rede local', cliente: 'Clínica Sorriso',
        valor: 175000, custoMaterial: 45000, data: '02-12', pagamento: 'full'
    },
    {
        descricao: 'Automação de controle financeiro em planilhas', cliente: 'Construtora Horizonte',
        valor: 125000, data: '02-20', pagamento: 'full'
    },

    // Março — R$ 6.950,00
    {
        descricao: 'Landing page para lançamento', cliente: 'Studio Movimento',
        valor: 210000, data: '03-03', pagamento: 'split',
        despesaDireta: { descricao: 'Revisão de textos comerciais', categoria: 'Terceirização', percentual: 0.15 }
    },
    {
        descricao: 'Suporte técnico mensal', cliente: 'Escritório Lima',
        valor: 95000, data: '03-11', pagamento: 'full'
    },
    {
        descricao: 'Catálogo digital interativo', cliente: 'Artesanato Raízes',
        valor: 195000, data: '03-18', pagamento: 'split',
        despesaDireta: { descricao: 'Banco de imagens e fontes licenciadas', categoria: 'Insumos', percentual: 0.13 }
    },
    {
        descricao: 'Treinamento de ferramentas de produtividade', cliente: 'Associação Nova Vida',
        valor: 195000, data: '03-25', pagamento: 'full',
        despesaDireta: { descricao: 'Impressão de apostilas do treinamento', categoria: 'Insumos', percentual: 0.11 }
    },

    // Abril — R$ 7.200,00
    {
        descricao: 'Portal institucional com blog', cliente: 'Oliveira Advocacia',
        valor: 360000, data: '04-02', pagamento: 'split',
        despesaDireta: { descricao: 'Configuração de servidor e SEO técnico', categoria: 'Terceirização', percentual: 0.15 }
    },
    {
        descricao: 'Gestão mensal de redes sociais', cliente: 'Mercado Bom Vizinho',
        valor: 110000, data: '04-10', pagamento: 'full'
    },
    {
        descricao: 'Upgrade de servidores e estações', cliente: 'Engenharia Martins',
        valor: 185000, custoMaterial: 65000, data: '04-19', pagamento: 'split'
    },

    // Maio — R$ 7.150,00
    {
        descricao: 'Sistema de agendamento online', cliente: 'Espaço Bela',
        valor: 340000, data: '05-05', pagamento: 'split',
        despesaDireta: { descricao: 'Serviço de testes e homologação', categoria: 'Terceirização', percentual: 0.16 }
    },
    {
        descricao: 'Ensaio fotográfico e tratamento de catálogo', cliente: 'Doce Encanto',
        valor: 145000, data: '05-14', pagamento: 'full',
        despesaDireta: { descricao: 'Acessórios de estúdio e cenografia', categoria: 'Insumos', percentual: 0.14 }
    },
    {
        descricao: 'Integração de formulários e CRM', cliente: 'Imobiliária Serra Verde',
        valor: 230000, data: '05-22', pagamento: 'split',
        despesaDireta: { descricao: 'Conector de APIs e webhooks', categoria: 'Insumos', percentual: 0.12 }
    },

    // Junho — R$ 6.800,00
    {
        descricao: 'Reestruturação de loja virtual', cliente: 'Moda Circular',
        valor: 350000, data: '06-03', pagamento: 'split',
        despesaDireta: { descricao: 'Apoio de design de interface', categoria: 'Terceirização', percentual: 0.17 }
    },
    {
        descricao: 'Suporte técnico mensal', cliente: 'Pousada Mar Azul',
        valor: 105000, data: '06-12', pagamento: 'full'
    },
    {
        descricao: 'Painel de indicadores gerenciais', cliente: 'Distribuidora Vale',
        valor: 225000, data: '06-22', pagamento: 'split'
    },

    // Julho — R$ 7.450,00
    {
        descricao: 'Migração de e-mails corporativos e domínio', cliente: 'Construtora Horizonte',
        valor: 185000, data: '07-02', pagamento: 'full'
    },
    {
        descricao: 'Cardápio digital com QR Code', cliente: 'Bistrô da Praça',
        valor: 165000, custoMaterial: 25000, data: '07-10', pagamento: 'full'
    },
    {
        descricao: 'Identidade visual e material de evento', cliente: 'Instituto Aprender',
        valor: 260000, data: '07-18', pagamento: 'split',
        despesaDireta: { descricao: 'Produção gráfica de banners e crachás', categoria: 'Insumos', percentual: 0.18 }
    },
    {
        descricao: 'Gestão mensal de redes sociais', cliente: 'Mercado Bom Vizinho',
        valor: 110000, data: '07-26', pagamento: 'full'
    },

    // Agosto — R$ 7.350,00
    {
        descricao: 'Aplicação web para reserva de quartos', cliente: 'Pousada Mar Azul',
        valor: 380000, data: '08-04', pagamento: 'split',
        despesaDireta: { descricao: 'Integração com gateway de pagamento', categoria: 'Terceirização', percentual: 0.15 }
    },
    {
        descricao: 'Auditoria e otimização de SEO', cliente: 'Oliveira Advocacia',
        valor: 165000, data: '08-13', pagamento: 'full'
    },
    {
        descricao: 'Automação de emissão de orçamentos', cliente: 'Oficina Central',
        valor: 190000, data: '08-22', pagamento: 'split'
    },

    // Setembro — R$ 7.500,00
    {
        descricao: 'Loja virtual completa com catálogo', cliente: 'Empório Central',
        valor: 390000, data: '09-02', pagamento: 'split',
        despesaDireta: { descricao: 'Fotografia de produtos do catálogo', categoria: 'Terceirização', percentual: 0.16 }
    },
    {
        descricao: 'Instalação de rede e Wi-Fi corporativo', cliente: 'Clínica Bem Estar',
        valor: 170000, custoMaterial: 55000, data: '09-11', pagamento: 'full'
    },
    {
        descricao: 'Consultoria em presença digital', cliente: 'Cafeteria Aurora',
        valor: 135000, data: '09-21', pagamento: 'full'
    },

    // Outubro — R$ 7.650,00
    {
        descricao: 'Portal do aluno e área restrita', cliente: 'Instituto Aprender',
        valor: 360000, data: '10-03', pagamento: 'split',
        despesaDireta: { descricao: 'Hospedagem inicial e certificado dedicado', categoria: 'Insumos', percentual: 0.12 }
    },
    {
        descricao: 'Atualização de site institucional', cliente: 'Engenharia Martins',
        valor: 165000, data: '10-12', pagamento: 'partial'
    },
    {
        descricao: 'Manutenção preventiva trimestral', cliente: 'Contabilidade Exata',
        valor: 130000, data: '10-20', pagamento: 'full'
    },
    {
        descricao: 'Gestão mensal de redes sociais', cliente: 'Mercado Bom Vizinho',
        valor: 110000, data: '10-27', pagamento: 'full'
    },

    // Novembro — R$ 7.550,00
    {
        descricao: 'Campanha digital de fim de ano', cliente: 'Empório Central',
        valor: 265000, data: '11-03', pagamento: 'split',
        despesaDireta: { descricao: 'Edição de vídeos promocionais', categoria: 'Terceirização', percentual: 0.15 }
    },
    {
        descricao: 'Integração de catálogo com WhatsApp', cliente: 'Moda Circular',
        valor: 225000, data: '11-09', pagamento: 'partial',
        despesaDireta: { descricao: 'Créditos de API oficial de mensagens', categoria: 'Insumos', percentual: 0.13 }
    },
    {
        descricao: 'Suporte técnico e manutenção de servidores', cliente: 'Escritório Lima',
        valor: 120000, data: '11-15', pagamento: 'full'
    },
    {
        descricao: 'Redesign de cardápio e materiais promocionais', cliente: 'Bistrô da Praça',
        valor: 145000, data: '11-19', pagamento: 'open'
    }
];

const recurringOperatingExpenses = [
    ['Tarifa bancária conta PJ', 'Serviços bancários', 3990, '01-05'],
    ['Internet empresarial fibra', 'Internet e telefone', 13990, '01-08'],
    ['Assinaturas de software e nuvem', 'Software', 14900, '01-12'],
    ['Energia elétrica do escritório', 'Água e energia', 16800, '01-15'],
    ['DAS MEI', 'Impostos', 8190, '01-20']
] as const;

const occasionalOperatingExpenses: readonly [string, string, number, string, boolean][] = [
    ['Deslocamento para visitas técnicas', 'Transporte e entregas', 11200, '01-18', true],
    ['Papelaria e suprimentos de escritório', 'Material de escritório', 11850, '02-11', true],
    ['Impulsionamento de anúncios digitais', 'Marketing', 18000, '02-22', true],
    ['Deslocamento para visitas técnicas', 'Transporte e entregas', 12400, '03-19', true],
    ['Manutenção e seguro de equipamentos', 'Outras despesas', 28900, '03-26', true],
    ['Sala de reunião e coworking', 'Aluguel', 24000, '04-14', true],
    ['Impulsionamento de anúncios digitais', 'Marketing', 18000, '05-18', true],
    ['Deslocamento para visitas técnicas', 'Transporte e entregas', 13600, '06-15', true],
    ['Papelaria e suprimentos de escritório', 'Material de escritório', 10900, '07-17', true],
    ['Sala de reunião e coworking', 'Aluguel', 24000, '08-19', true],
    ['Impulsionamento de anúncios digitais', 'Marketing', 21000, '08-25', true],
    ['Deslocamento para visitas técnicas', 'Transporte e entregas', 11800, '09-14', true],
    ['Manutenção e seguro de equipamentos', 'Outras despesas', 28900, '09-24', true],
    ['Papelaria e suprimentos de escritório', 'Material de escritório', 12600, '10-16', true],
    ['Deslocamento para visitas técnicas', 'Transporte e entregas', 12900, '11-12', true],
    ['Impulsionamento de anúncios digitais', 'Marketing', 22000, '11-18', true],
    ['Sala de reunião e coworking', 'Aluguel', 24000, '11-24', false]
];

function addDays(date: string, days: number) {
    const value = new Date(date + 'T00:00:00Z');
    value.setUTCDate(value.getUTCDate() + days);
    const result = value.toISOString().slice(0, 10);
    const limit = `${year}-11-30`;
    return result > limit ? limit : result;
}

const databasePath = resolve(process.env.GFMEI_DB ?? 'data/gfmei.sqlite');
const workspace = process.env.GFMEI_WORKSPACE ?? 'installation';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new SqliteRepository(databasePath);
const ledger = new Ledger(database.forWorkspace(workspace), () => `${year}-11-30`);

try {
    const existing = ['servicos', 'despesas', 'recebimentos'] as const;
    if (existing.some(kind => ledger.list(kind).length > 0 || (workspace === 'installation' && database.list(kind).length > 0))) {
        throw new Error('O banco já contém lançamentos. A carga de demonstração não foi aplicada.');
    }

    let duplicateReceiptServiceId: number | null = null;
    let duplicateReceiptAmount = 0;

    for (const item of services) {
        const data = dateInYear(item.data);
        const valor = scaleAmount(item.valor);
        const custoMaterial = item.custoMaterial === undefined ? null : scaleAmount(item.custoMaterial);
        const service = ledger.save('servicos', {
            descricao: item.descricao,
            detalhe: item.cliente,
            valor,
            custoMaterial,
            data,
            servico: null,
            pagamento: null
        });
        const agreedTotal = serviceTotal(service);

        if (item.despesaDireta) {
            const directCost = Math.round(valor * item.despesaDireta.percentual);
            const expenseDate = addDays(data, 2);
            const unpaidNovExpense = item.data === '11-09';
            ledger.save('despesas', {
                descricao: item.despesaDireta.descricao,
                detalhe: item.despesaDireta.categoria,
                valor: directCost,
                data: expenseDate,
                servico: service.id,
                pagamento: unpaidNovExpense ? null : expenseDate
            });
        }

        if (item.pagamento === 'full') {
            ledger.save('recebimentos', {
                descricao: 'Pagamento integral do serviço',
                detalhe: null,
                valor: agreedTotal,
                data: addDays(data, 3),
                servico: service.id,
                pagamento: null
            });
        } else if (item.pagamento === 'split') {
            const firstPart = Math.round(agreedTotal * 0.4);
            if (item.data === '08-04') {
                duplicateReceiptServiceId = service.id;
                duplicateReceiptAmount = firstPart;
            }
            ledger.save('recebimentos', {
                descricao: 'Entrada do serviço',
                detalhe: null,
                valor: firstPart,
                data: addDays(data, 1),
                servico: service.id,
                pagamento: null
            });
            ledger.save('recebimentos', {
                descricao: 'Pagamento final',
                detalhe: null,
                valor: agreedTotal - firstPart,
                data: addDays(data, 12),
                servico: service.id,
                pagamento: null
            });
        } else if (item.pagamento === 'partial') {
            ledger.save('recebimentos', {
                descricao: 'Pagamento parcial',
                detalhe: null,
                valor: Math.round(agreedTotal * 0.5),
                data: addDays(data, 4),
                servico: service.id,
                pagamento: null
            });
        }
    }

    if (duplicateReceiptServiceId !== null) {
        const duplicate = ledger.save('recebimentos', {
            descricao: 'Recebimento lançado em duplicidade',
            detalhe: null,
            valor: duplicateReceiptAmount,
            data: dateInYear('08-06'),
            servico: duplicateReceiptServiceId,
            pagamento: null,
            cancelado: true
        });
        ledger.cancel('recebimentos', duplicate.id);
    }

    // Despesas fixas mensais (recorrentes de janeiro a novembro)
    for (const [descricao, categoria, valor, monthDay] of recurringOperatingExpenses) {
        const data = dateInYear(monthDay);
        ledger.save('despesas', {
            descricao,
            detalhe: categoria,
            valor,
            data,
            servico: null,
            pagamento: data,
            recorrente: true
        });
    }

    // Sincroniza parcelas recorrentes até novembro e marca como pagas (exceto DAS MEI de novembro)
    for (const expense of ledger.list('despesas')) {
        if (!expense.recorrenciaOrigem || expense.pagamento !== null) continue;
        if (expense.descricao === 'DAS MEI' && expense.data.startsWith(`${year}-11-`)) continue;
        ledger.save('despesas', {
            descricao: expense.descricao,
            detalhe: expense.detalhe,
            valor: expense.valor,
            data: expense.data,
            servico: expense.servico,
            pagamento: expense.data
        }, expense.id);
    }

    // Despesas operacionais variáveis ao longo de janeiro a novembro
    for (const [descricao, categoria, valor, monthDay, paid] of occasionalOperatingExpenses) {
        const data = dateInYear(monthDay);
        ledger.save('despesas', {
            descricao,
            detalhe: categoria,
            valor,
            data,
            servico: null,
            pagamento: paid ? data : null
        });
    }

    // Lançamentos cancelados para demonstrar preservação de histórico sem impactar totais
    const cancelledExpense = ledger.save('despesas', {
        descricao: 'Compra lançada em duplicidade',
        detalhe: 'Material de escritório',
        valor: 15900,
        data: dateInYear('09-16'),
        servico: null,
        pagamento: dateInYear('09-16')
    });
    ledger.cancel('despesas', cancelledExpense.id);

    const cancelledServices = [
        ['Projeto adiado pelo cliente', 'Loja Primavera', 180000, '06-27'],
        ['Orçamento cancelado pelo cliente', 'Padaria Central', 150000, '10-28']
    ] as const;
    for (const [descricao, cliente, valor, monthDay] of cancelledServices) {
        const cancelled = ledger.save('servicos', {
            descricao,
            detalhe: cliente,
            valor: scaleAmount(valor),
            data: dateInYear(monthDay),
            servico: null,
            pagamento: null
        });
        ledger.cancel('servicos', cancelled.id);
    }

    const totalServices = ledger.list('servicos');
    const totalExpenses = ledger.list('despesas');
    const totalReceipts = ledger.list('recebimentos');
    const [november] = recordedRevenue([`${year}-11`], totalServices);
    const room = BigInt(ceiling) - november.total;

    console.log(
        `Carga de ${year} (jan–nov) concluída: ${totalServices.length} serviços, ` +
        `${totalExpenses.length} despesas e ${totalReceipts.length} recebimentos.`
    );
    console.log(
        `Faturamento acumulado até novembro/${year}: R$ ${(Number(november.total) / 100).toFixed(2)} ` +
        `de R$ ${(ceiling / 100).toFixed(2)} (margem para dezembro: R$ ${(Number(room) / 100).toFixed(2)}).`
    );
} finally {
    database.close();
}
