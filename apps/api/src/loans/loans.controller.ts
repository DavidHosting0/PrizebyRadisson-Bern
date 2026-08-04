import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateLoanDto, UpsertLoanCatalogDto } from './dto/loan.dto';
import { LoansService } from './loans.service';

@Controller('loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get('catalog')
  @RequirePermissions(PermissionCode.LOANS_READ)
  listCatalog(@Query('all') all?: string) {
    return this.loans.listCatalog(all === '1' || all === 'true');
  }

  @Post('catalog')
  @RequirePermissions(PermissionCode.LOANS_CATALOG_WRITE)
  createCatalog(@Body() dto: UpsertLoanCatalogDto) {
    return this.loans.createCatalogItem(dto);
  }

  @Patch('catalog/:id')
  @RequirePermissions(PermissionCode.LOANS_CATALOG_WRITE)
  updateCatalog(@Param('id') id: string, @Body() dto: UpsertLoanCatalogDto) {
    return this.loans.updateCatalogItem(id, dto);
  }

  @Get()
  @RequirePermissions(PermissionCode.LOANS_READ)
  list(@Query('active') active?: string) {
    const activeOnly = active !== '0' && active !== 'false';
    return this.loans.listLoans(activeOnly);
  }

  @Post()
  @RequirePermissions(PermissionCode.LOANS_WRITE)
  create(@Body() dto: CreateLoanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.loans.createLoan(dto, user);
  }

  @Post(':id/return')
  @RequirePermissions(PermissionCode.LOANS_WRITE)
  returnLoan(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.loans.returnLoan(id, user);
  }
}
