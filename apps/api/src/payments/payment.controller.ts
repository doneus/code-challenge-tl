import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PaymentStatusResponse } from '@app/shared/payments/payment-status.contract';
import { CreatePaymentAcceptedResponse, CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentService } from './payment.service';
import { StatusQueryService } from './status-query.service';

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly statusQueryService: StatusQueryService,
  ) {}

  @Post()
  createPayment(@Body() dto: CreatePaymentDto): Promise<CreatePaymentAcceptedResponse> {
    return this.paymentService.createPayment(dto);
  }

  @Get(':id/status')
  getPaymentStatus(@Param('id') paymentId: string): Promise<PaymentStatusResponse> {
    return this.statusQueryService.getPaymentStatus(paymentId);
  }
}
