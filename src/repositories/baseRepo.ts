import { supabase } from "../config/supabase";

export class BaseRepository<T extends Record<string, any>> {
    protected tableName: string;

    constructor(tableName: string) {
        this.tableName = tableName;
    }

    async getAll(
        select = "*",
        options?: {
            limit?: number;
            offset?: number;
            orderBy?: string;
            ascending?: boolean;
        }
    ): Promise<T[]> {
        let query = supabase.from(this.tableName).select(select);

        if (options?.orderBy) {
            query = query.order(options.orderBy, {
                ascending: options.ascending ?? true,
            });
        }

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(
                options.offset,
                options.offset + (options.limit ?? 10) - 1
            );
        }

        const { data, error } = await query;
        if (error) throw error;
        return ((data as unknown) as T[]) ?? [];
    }

    async getById(id: string, select = "*"): Promise<T | null> {
        const { data, error } = await supabase
            .from(this.tableName)
            .select(select)
            .eq("id", id)
            .single();

        if (error) throw error;
        return (data as unknown) as T | null;
    }

    async getByColumn(
        column: string,
        value: any,
        select = "*"
    ): Promise<T[]> {
        const { data, error } = await supabase
            .from(this.tableName)
            .select(select)
            .eq(column, value);

        if (error) throw error;
        return ((data as unknown) as T[]) ?? [];
    }

    async create(record: Partial<T>): Promise<T> {
        const { data, error } = await supabase
            .from(this.tableName)
            .insert(record)
            .select()
            .single();

        if (error) throw error;
        return (data as unknown) as T;
    }

    async update(id: string, record: Partial<T>): Promise<T> {
        const { data, error } = await supabase
            .from(this.tableName)
            .update(record)
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;
        return (data as unknown) as T;
    }

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from(this.tableName)
            .delete()
            .eq("id", id);

        if (error) throw error;
    }

    protected get query() {
        return supabase.from(this.tableName);
    }
}
