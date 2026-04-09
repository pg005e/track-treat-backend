import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Profile } from './profile.entity';
import { Session } from 'src/auth/entities';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ unique: true })
  username: string;

  @Column({ type: 'varchar', select: false, nullable: true })
  password: string | null;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @OneToMany(() => Session, (session) => session.user)
  sessions: Session[];

  @OneToOne(() => Profile, (p) => p.user, {
    cascade: ['insert', 'update'],
    onDelete: 'SET NULL',
  })
  profile: Profile;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
