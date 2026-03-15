import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateKycDocumentDto } from './dto/create-kyc-document.dto';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';
import { VerifyIdfyDto } from './dto/verify-idfy.dto';
import { KycService } from './kyc.service';

@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('upload-url')
  uploadUrl(@Body() payload: GenerateUploadUrlDto) {
    return this.kycService.generateUploadUrl(payload);
  }

  @Post('documents')
  createDocument(@Body() payload: CreateKycDocumentDto) {
    return this.kycService.createDocument(payload);
  }

  @Post('verify/idfy')
  verifyIdfy(@Body() payload: VerifyIdfyDto) {
    return this.kycService.verifyIdfy(payload);
  }

  @Post('verify/cashfree')
  verifyCashfree(@Body() payload: VerifyIdfyDto) {
    return this.kycService.verifyIdfy(payload);
  }

  @Post('verify/surepass')
  verifySurepass(@Body() payload: VerifyIdfyDto) {
    return this.kycService.verifyIdfy(payload);
  }

  @Post('verify/provider')
  verifyProvider(@Body() payload: VerifyIdfyDto) {
    return this.kycService.verifyIdfy(payload);
  }

  @Get('status/me')
  status(@Query('userId') userId: string) {
    return this.kycService.status(userId);
  }
}
