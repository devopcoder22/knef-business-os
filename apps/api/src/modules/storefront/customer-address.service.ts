import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { createId } from '@paralleldrive/cuid2';

export interface CreateSavedAddressDto {
  label?: string;
  fullName?: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
  placeId?: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  addressSource?: 'GOOGLE_PLACE' | 'MANUAL' | 'SAVED_ADDRESS' | 'ADMIN' | 'IMPORTED';
  isDefault?: boolean;
}

@Injectable()
export class CustomerAddressService {
  constructor(private readonly prisma: PrismaService) {}

  async listAddresses(customerAccountId: string, organizationId: string) {
    return this.prisma.savedAddress.findMany({
      where: { customerAccountId, organizationId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(
    customerAccountId: string,
    organizationId: string,
    dto: CreateSavedAddressDto,
  ) {
    if (!dto.addressLine1 || dto.addressLine1.trim().length < 3) {
      throw new BadRequestException('Address line 1 is required (min 3 characters)');
    }
    this.validateCoordinates(dto.latitude, dto.longitude);

    if (dto.isDefault) {
      await this.prisma.savedAddress.updateMany({
        where: { customerAccountId, organizationId },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedAddress.create({
      data: {
        id: createId(),
        customerAccountId,
        organizationId,
        label: dto.label,
        fullName: dto.fullName,
        phone: dto.phone,
        addressLine1: dto.addressLine1.trim(),
        addressLine2: dto.addressLine2?.trim(),
        landmark: dto.landmark?.trim(),
        city: dto.city?.trim(),
        state: dto.state?.trim(),
        postalCode: dto.postalCode?.trim(),
        country: dto.country ?? 'Nigeria',
        countryCode: dto.countryCode ?? 'NG',
        placeId: dto.placeId,
        formattedAddress: dto.formattedAddress,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        addressSource: dto.addressSource ?? 'MANUAL',
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async updateAddress(
    customerAccountId: string,
    organizationId: string,
    addressId: string,
    dto: Partial<CreateSavedAddressDto>,
  ) {
    const existing = await this.prisma.savedAddress.findFirst({
      where: { id: addressId, customerAccountId, organizationId },
    });
    if (!existing) throw new NotFoundException('Address not found');

    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      this.validateCoordinates(
        dto.latitude ?? existing.latitude?.toNumber(),
        dto.longitude ?? existing.longitude?.toNumber(),
      );
    }

    if (dto.isDefault) {
      await this.prisma.savedAddress.updateMany({
        where: { customerAccountId, organizationId, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedAddress.update({
      where: { id: addressId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.addressLine1 !== undefined && { addressLine1: dto.addressLine1.trim() }),
        ...(dto.addressLine2 !== undefined && { addressLine2: dto.addressLine2?.trim() }),
        ...(dto.landmark !== undefined && { landmark: dto.landmark?.trim() }),
        ...(dto.city !== undefined && { city: dto.city?.trim() }),
        ...(dto.state !== undefined && { state: dto.state?.trim() }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode?.trim() }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.countryCode !== undefined && { countryCode: dto.countryCode }),
        ...(dto.placeId !== undefined && { placeId: dto.placeId }),
        ...(dto.formattedAddress !== undefined && { formattedAddress: dto.formattedAddress }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.addressSource !== undefined && { addressSource: dto.addressSource }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  async deleteAddress(customerAccountId: string, organizationId: string, addressId: string) {
    const existing = await this.prisma.savedAddress.findFirst({
      where: { id: addressId, customerAccountId, organizationId },
    });
    if (!existing) throw new NotFoundException('Address not found');

    return this.prisma.savedAddress.delete({ where: { id: addressId } });
  }

  async setDefault(customerAccountId: string, organizationId: string, addressId: string) {
    const existing = await this.prisma.savedAddress.findFirst({
      where: { id: addressId, customerAccountId, organizationId },
    });
    if (!existing) throw new ForbiddenException('Address not found');

    await this.prisma.savedAddress.updateMany({
      where: { customerAccountId, organizationId },
      data: { isDefault: false },
    });
    return this.prisma.savedAddress.update({
      where: { id: addressId },
      data: { isDefault: true },
    });
  }

  private validateCoordinates(lat?: number | null, lng?: number | null): void {
    if (lat !== undefined && lat !== null) {
      if (typeof lat !== 'number' || lat < -90 || lat > 90) {
        throw new BadRequestException('Latitude must be between -90 and 90');
      }
    }
    if (lng !== undefined && lng !== null) {
      if (typeof lng !== 'number' || lng < -180 || lng > 180) {
        throw new BadRequestException('Longitude must be between -180 and 180');
      }
    }
  }
}
