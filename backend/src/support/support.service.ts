import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(user: AuthenticatedUser) {
    const isStaff =
      user.permissions.includes('*') ||
      user.permissions.includes('support.read.any');
    return this.prisma.supportTicket.findMany({
      where: isStaff ? undefined : { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { user: { select: { id: true, username: true } } },
    });
  }

  async findAccessibleOrThrow(id: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.supportTicket.findUniqueOrThrow({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, username: true } } },
        },
      },
    });
    const isStaff =
      user.permissions.includes('*') ||
      user.permissions.includes('support.read.any');
    if (!isStaff && ticket.userId !== user.id) {
      throw new ForbiddenException("Vous n'avez pas accès à ce ticket");
    }
    return ticket;
  }

  create(subject: string, message: string, userId: string) {
    return this.prisma.supportTicket.create({
      data: {
        subject,
        userId,
        messages: {
          create: { body: message, authorId: userId, isStaff: false },
        },
      },
      include: { messages: true },
    });
  }

  async reply(
    ticketId: string,
    body: string,
    authorId: string,
    isStaff: boolean,
  ) {
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: isStaff ? 'PENDING' : 'OPEN', updatedAt: new Date() },
    });
    return this.prisma.ticketMessage.create({
      data: { ticketId, body, authorId, isStaff },
    });
  }

  setStatus(
    ticketId: string,
    status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED',
  ) {
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status },
    });
  }
}
