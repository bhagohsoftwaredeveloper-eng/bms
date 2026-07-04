import { PartialType } from '@nestjs/mapped-types';
import { CreateNenposClientDto } from './create-nenpos-client.dto';

export class UpdateNenposClientDto extends PartialType(CreateNenposClientDto) {}
