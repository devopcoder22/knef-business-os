import { Global, Module } from '@nestjs/common';
import { CredentialCryptoService } from './credential-crypto.service';
import { CredentialService } from './credential.service';
import { CredentialController } from './credential.controller';

@Global()
@Module({
  controllers: [CredentialController],
  providers: [CredentialCryptoService, CredentialService],
  exports: [CredentialService],
})
export class CredentialModule {}
