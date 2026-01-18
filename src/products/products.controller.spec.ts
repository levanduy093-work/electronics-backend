import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: ProductsService;

  const mockProductsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: mockProductsService,
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of products', async () => {
      const mockProducts = [
        {
          _id: '1',
          name: 'Test Product',
          price: { originalPrice: 100000, salePrice: 80000 },
          stock: 10,
        },
      ];

      mockProductsService.findAll.mockResolvedValueOnce(mockProducts);

      const result = await controller.findAll();

      expect(result).toEqual(mockProducts);
      expect(mockProductsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single product', async () => {
      const mockProduct = {
        _id: '1',
        name: 'Test Product',
        price: { originalPrice: 100000, salePrice: 80000 },
        stock: 10,
      };

      mockProductsService.findOne.mockResolvedValueOnce(mockProduct);

      const result = await controller.findOne('1');

      expect(result).toEqual(mockProduct);
      expect(mockProductsService.findOne).toHaveBeenCalledWith('1');
    });
  });
});
