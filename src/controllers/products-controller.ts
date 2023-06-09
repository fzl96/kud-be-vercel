import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../lib/db";

const productSchema = z.object({
  name: z.string().optional(),
  price: z.number().positive().optional(),
  stock: z.number().positive().optional(),
  categoryId: z.string().optional(),
  barcode: z.string().optional(),
});

export const getProducts = async (req: Request, res: Response) => {
  const includeCategories = req.query.include_categories === "true";
  try {
    const products = await db.product.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        createdAt: true,
        updatedAt: true,
        barcode: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (includeCategories) {
      const categories = await db.category.findMany();
      res.status(200).json({ products, categories });
      return;
    }
    res.status(200).json(products);
  } catch (err) {
    if (err instanceof Error) res.status(500).json({ error: err.message });
  }
};

export const getProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const product = await db.product.findUnique({
      where: { id: id as string },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        active: true,
        barcode: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (!product) {
      res.status(404).json({ error: "Produk tidak ditemukan" });
      return;
    }
    res.status(200).json(product);
  } catch (err) {
    if (err instanceof Error) res.status(500).json({ error: err.message });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  const { name, categoryId, price, stock, barcode } = req.body;

  if (!name || !categoryId || !price || !stock) {
    res
      .status(400)
      .json({ error: "Nama, Kategori, Harga, dan Stok diperlukan!" });
    return;
  }

  const isValid = productSchema.safeParse(req.body);
  if (!isValid.success) {
    res.status(400).json({ error: "Data tidak valid" });
    return;
  }

  try {
    const existingProduct = await db.product.findUnique({
      where: { name: name },
    });

    if (existingProduct && existingProduct.active) {
      res.status(400).json({ error: "Produk sudah ada" });
      return;
    }

    const product = await db.product.upsert({
      where: { name: name },
      update: {
        active: true,
        stock,
        price,
        category: { connect: { id: categoryId } },
        barcode,
      },
      create: { name, categoryId, stock, price, active: true, barcode },
    });

    res.status(201).json(product);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        res.status(400).json({ error: "Produk sudah ada" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, categoryId, price, active, barcode } = req.body;

  const isValid = productSchema.safeParse(req.body);
  if (!isValid.success) {
    res.status(400).json({ error: isValid.error.message });
    return;
  }
  try {
    const updateData: Prisma.ProductUpdateInput = {};

    if (name) updateData.name = name;
    if (categoryId) updateData.category = { connect: { id: categoryId } };
    if (price) updateData.price = price;
    if (active) updateData.active = active;
    if (barcode) updateData.barcode = barcode;

    const product = await db.product.update({
      where: { id: id as string },
      data: updateData,
    });
    res.status(200).json(product);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        res.status(404).json({ error: "Kategori tidak ditemukan" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const product = await db.product.findUnique({
      where: { id: id as string },
      include: {
        purchases: true,
        sales: true,
      },
    });

    if (product?.purchases.length || product?.sales.length) {
      await db.product.update({
        where: { id: id as string },
        data: { active: false },
      });
      res.status(200).json({ message: "Produk dinonaktifkan" });
      return;
    }

    await db.product.delete({
      where: { id: id as string },
    });

    res.status(200).json({ message: "Produk dihapus" });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        res.status(404).json({ error: "Produk tidak ditemukan" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }
};

export const deleteProducts = async (req: Request, res: Response) => {
  const { ids } = req.body;
  try {
    const products = await db.product.findMany({
      where: { id: { in: ids } },
      include: {
        purchases: true,
        sales: true,
      },
    });

    products.forEach(async (product) => {
      if (product.purchases.length || product.sales.length) {
        await db.product.update({
          where: { id: product.id },
          data: { active: false },
        });
      } else {
        await db.product.delete({
          where: { id: product.id },
        });
      }
    });

    res.status(200).json({ message: "Produk dihapus" });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        res.status(404).json({ error: "Produk tidak ditemukan" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }
};
