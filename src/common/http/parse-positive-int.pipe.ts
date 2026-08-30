import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { validationFailed } from "../errors/app-error";

@Injectable()
export class ParsePositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    if (!/^[1-9]\d*$/.test(value)) {
      throw validationFailed(
        `${metadata.data ?? "value"} must be a positive integer.`,
      );
    }
    return Number(value);
  }
}
